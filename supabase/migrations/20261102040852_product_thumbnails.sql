-- A small derivative, not a replacement for any product/document original.
alter table public.products add column preview_data_url text;
alter table public.products add column preview_source_hash text;

create function sp_private.validate_product_thumbnail() returns trigger
language plpgsql set search_path = '' as $$
declare pixels bytea; width bigint; height bigint; preview text;
begin
  if tg_op='UPDATE' and new.data is distinct from old.data
     and sp_private.product_photo_snapshot(new.data) is distinct from sp_private.product_photo_snapshot(old.data) then
    new.preview_data_url := null; new.preview_source_hash := null;
  end if;
  preview := new.preview_data_url;
  if preview is null then new.preview_source_hash:=null;return new;end if;
  if tg_op='UPDATE' and preview is not distinct from old.preview_data_url then return new;end if;
  if octet_length(preview)>262144 or preview !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Miniatura PNG inválida ou maior que 256 KB.';
  end if;
  pixels := decode(split_part(preview,',',2),'base64');
  if octet_length(pixels)<33 or substring(pixels from 1 for 8)<>decode('89504e470d0a1a0a','hex')
     or substring(pixels from 13 for 4)<>decode('49484452','hex') then raise exception 'Arquivo de miniatura PNG inválido.';end if;
  width := get_byte(pixels,16)::bigint*16777216+get_byte(pixels,17)*65536+get_byte(pixels,18)*256+get_byte(pixels,19);
  height := get_byte(pixels,20)::bigint*16777216+get_byte(pixels,21)*65536+get_byte(pixels,22)*256+get_byte(pixels,23);
  if width not between 1 and 384 or height not between 1 and 384 then raise exception 'Miniatura limitada a 384 pixels por lado.';end if;
  new.preview_source_hash := md5(sp_private.product_photo_snapshot(new.data)::text);
  return new;
end $$;
revoke all on function sp_private.validate_product_thumbnail() from public,anon,authenticated;
create trigger validate_product_thumbnail before insert or update on public.products
for each row execute function sp_private.validate_product_thumbnail();

create function sp_private.save_product_thumbnail(company uuid,product text,expected bigint,preview text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_version bigint; result jsonb;
begin
  perform sp_private.require_access(company,'products',true);
  perform pg_advisory_xact_lock(hashtextextended(company::text||':product-taxonomy',0));
  perform pg_advisory_xact_lock(hashtextextended(company::text||'products'||product,0));
  select version into current_version from public.products where company_id=company and id=product for update;
  if not found then raise exception 'O produto não está mais disponível.' using errcode='P0002';end if;
  if expected is null or expected<>current_version then raise exception 'O catálogo mudou. Atualize antes de salvar a miniatura.' using errcode='40001';end if;
  if preview is null then raise exception 'Informe a miniatura PNG.';end if;
  update public.products set preview_data_url=preview,version=version+1,updated_at=now()
    where company_id=company and id=product returning jsonb_build_object('id',id,'_version',version) into result;
  insert into public.audit_log(company_id,actor_id,resource,record_id,action,version,details)
    values(company,auth.uid(),'products',product,'save',current_version+1,jsonb_build_object('operation','thumbnail'));
  return result;
end $$;
create function public.sp_product_thumbnail_save(p_company_id uuid,p_id text,p_expected_version bigint,p_preview text) returns jsonb
language sql security invoker set search_path = '' as $$select sp_private.save_product_thumbnail(p_company_id,p_id,p_expected_version,p_preview)$$;
revoke all on function sp_private.save_product_thumbnail(uuid,text,bigint,text),public.sp_product_thumbnail_save(uuid,text,bigint,text)
  from public,anon,authenticated;
grant execute on function sp_private.save_product_thumbnail(uuid,text,bigint,text),public.sp_product_thumbnail_save(uuid,text,bigint,text)
  to authenticated;

create or replace function sp_private.product_previews(company uuid,keys text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform sp_private.require_access(company,'products');
  if keys is null or cardinality(keys)>25 or coalesce(array_ndims(keys),1)<>1 then raise exception 'Solicite prévias de até 25 produtos por vez.';end if;
  if exists(select 1 from unnest(keys) id where id is null or id !~ '^[A-Za-z0-9_-]{1,100}$' or id in ('__proto__','constructor','prototype')) then raise exception 'Identificador de produto inválido.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'_version',version,'isThumbnail',preview_data_url is not null,
    'photos',case when preview_data_url is not null then jsonb_build_array(preview_data_url)
      when snapshot->>'photo'<>'' then jsonb_build_array(snapshot->>'photo') else '[]'::jsonb end,
    'photoAssets',case when preview_data_url is not null then '[]'::jsonb else snapshot->'photoAssets' end)
    order by array_position(keys,id)),'[]') into result from
    (select id,version,preview_data_url,case when preview_data_url is null then sp_private.product_photo_snapshot(data) end snapshot
     from public.products where company_id=company and id=any(keys)) selected;
  return result;
end $$;
notify pgrst, 'reload schema';
