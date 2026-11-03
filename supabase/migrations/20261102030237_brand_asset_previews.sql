-- Derived previews are separate from the original PNG and the folder metadata.
alter table public.brand_assets
  add column preview_data_url text generated always as (data->>'previewDataURL') stored;
alter table public.brand_assets alter column metadata
  set expression as (data - array['dataURL', 'previewDataURL']);

create function sp_private.validate_brand_preview() returns trigger
language plpgsql set search_path = '' as $$
declare pixels bytea; width bigint; height bigint; preview text;
begin
  -- Metadata-only edits retain the thumbnail; changed originals cannot retain an old one.
  if tg_op = 'UPDATE' and new.data->>'dataURL' is distinct from old.data->>'dataURL'
     and new.data->>'previewDataURL' is not distinct from old.data->>'previewDataURL' then
    new.data := new.data - 'previewDataURL';
  end if;
  preview := new.data->>'previewDataURL';
  if preview is null then return new; end if;
  if octet_length(preview) > 524288
     or preview !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Prévia PNG inválida ou maior que 512 KB.';
  end if;
  pixels := decode(split_part(preview, ',', 2), 'base64');
  if octet_length(pixels) < 33
     or substring(pixels from 1 for 8) <> decode('89504e470d0a1a0a', 'hex')
     or substring(pixels from 13 for 4) <> decode('49484452', 'hex') then
    raise exception 'Arquivo da prévia PNG inválido.';
  end if;
  width := get_byte(pixels,16)::bigint*16777216 + get_byte(pixels,17)*65536 + get_byte(pixels,18)*256 + get_byte(pixels,19);
  height := get_byte(pixels,20)::bigint*16777216 + get_byte(pixels,21)*65536 + get_byte(pixels,22)*256 + get_byte(pixels,23);
  if width not between 1 and 512 or height not between 1 and 512 then
    raise exception 'A prévia deve ter no máximo 512 pixels por lado.';
  end if;
  return new;
end $$;
revoke all on function sp_private.validate_brand_preview() from public, anon, authenticated;
create trigger validate_brand_preview before insert or update on public.brand_assets
for each row execute function sp_private.validate_brand_preview();

create function sp_private.brand_asset_preview(company uuid, asset text, expected bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; current_version bigint;
begin
  perform sp_private.require_access(company, 'brand_assets');
  select version, jsonb_build_object('id', id, '_version', version, 'dataURL', preview_data_url)
    into current_version, result from public.brand_assets where company_id = company and id = asset;
  if not found then raise exception 'O PNG não está mais disponível.' using errcode = 'P0002'; end if;
  if expected is null or current_version <> expected then
    raise exception 'A biblioteca mudou. Atualize a pasta.' using errcode = '40001';
  end if;
  return result;
end $$;
create function public.sp_brand_asset_preview(p_company_id uuid, p_id text, p_expected_version bigint) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sp_private.brand_asset_preview(p_company_id, p_id, p_expected_version)
$$;

-- Maintenance/backfill also uses version checks and the normal resource signal.
create function sp_private.save_brand_asset_preview(company uuid, asset text, expected bigint, preview text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_version bigint; result jsonb;
begin
  perform sp_private.require_access(company, 'brand_assets', true);
  select version into current_version from public.brand_assets
    where company_id = company and id = asset for update;
  if not found then raise exception 'O PNG não está mais disponível.' using errcode = 'P0002'; end if;
  if expected is null or current_version <> expected then
    raise exception 'A biblioteca mudou. Atualize a pasta.' using errcode = '40001';
  end if;
  if preview is null then raise exception 'Informe a prévia PNG.'; end if;
  update public.brand_assets set data = data || jsonb_build_object('previewDataURL', preview), version = version + 1, updated_at = now()
    where company_id = company and id = asset
    returning jsonb_build_object('id', id, '_version', version) into result;
  return result;
end $$;
create function public.sp_brand_asset_preview_save(p_company_id uuid, p_id text, p_expected_version bigint, p_preview text) returns jsonb
language sql security invoker set search_path = '' as $$
  select sp_private.save_brand_asset_preview(p_company_id, p_id, p_expected_version, p_preview)
$$;
revoke all on function sp_private.brand_asset_preview(uuid,text,bigint),
  public.sp_brand_asset_preview(uuid,text,bigint),
  sp_private.save_brand_asset_preview(uuid,text,bigint,text),
  public.sp_brand_asset_preview_save(uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function sp_private.brand_asset_preview(uuid,text,bigint),
  public.sp_brand_asset_preview(uuid,text,bigint),
  sp_private.save_brand_asset_preview(uuid,text,bigint,text),
  public.sp_brand_asset_preview_save(uuid,text,bigint,text) to authenticated;
notify pgrst, 'reload schema';
