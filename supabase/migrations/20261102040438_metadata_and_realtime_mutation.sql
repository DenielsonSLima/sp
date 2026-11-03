alter table public.resource_changes add column mutation_id text;
alter table public.resource_changes add constraint resource_mutation_id_uuid
  check (mutation_id is null or mutation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Correlation only: access continues to come from company membership, never this header.
create or replace function sp_private.track_resource_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare company uuid; changed_resource text; mutation text; headers text;
begin
  company := case when tg_op='DELETE' then old.company_id else new.company_id end;
  changed_resource := case when tg_table_name='memberships' then 'user_access' else tg_table_name end;
  if sp_private.module_for(changed_resource) is null then raise exception 'Recurso de sinalização inválido.';end if;
  headers := current_setting('request.headers',true);
  begin
    mutation := lower(nullif(headers,'')::jsonb->>'x-sp-mutation-id');
  exception when invalid_text_representation then mutation := null;
  end;
  if mutation is not null and mutation !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then mutation:=null;end if;
  insert into public.resource_changes(company_id,resource,revision,updated_at,mutation_id)
    values(company,changed_resource,1,clock_timestamp(),mutation)
    on conflict(company_id,resource) do update set revision=resource_changes.revision+1,
      updated_at=excluded.updated_at,mutation_id=excluded.mutation_id;
  return null;
end $$;
revoke all on function sp_private.track_resource_change() from public,anon,authenticated;

create function sp_private.brand_asset_metadata_update(company uuid,asset text,new_name text,new_category text,expected bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_version bigint; result jsonb;
begin
  perform sp_private.require_access(company,'brand_assets',true);
  if new_name is null or length(trim(new_name)) not between 1 and 100
     or new_category is null or length(trim(new_category)) not between 1 and 80 then raise exception 'Nome ou categoria inválidos.';end if;
  if not exists(select 1 from public.brand_categories where company_id=company and data->>'name'=trim(new_category)) then
    raise exception 'Selecione uma categoria válida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||'brand_assets'||asset,0));
  select version into current_version from public.brand_assets where company_id=company and id=asset for update;
  if not found then raise exception 'O PNG não está mais disponível.' using errcode='P0002';end if;
  if expected is null or expected<>current_version then raise exception 'A biblioteca mudou. Atualize a pasta.' using errcode='40001';end if;
  update public.brand_assets set data=data||jsonb_build_object('name',trim(new_name),'category',trim(new_category)),
    version=version+1,updated_at=now() where company_id=company and id=asset
    returning metadata||jsonb_build_object('id',id,'_version',version,'hasPreview',preview_data_url is not null) into result;
  insert into public.audit_log(company_id,actor_id,resource,record_id,action,version)
    values(company,auth.uid(),'brand_assets',asset,'save',current_version+1);
  return result;
end $$;
create function public.sp_brand_asset_metadata_update(p_company_id uuid,p_id text,p_name text,p_category text,p_expected_version bigint) returns jsonb
language sql security invoker set search_path = '' as $$
  select sp_private.brand_asset_metadata_update(p_company_id,p_id,p_name,p_category,p_expected_version)
$$;
revoke all on function sp_private.brand_asset_metadata_update(uuid,text,text,text,bigint),
  public.sp_brand_asset_metadata_update(uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function sp_private.brand_asset_metadata_update(uuid,text,text,text,bigint),
  public.sp_brand_asset_metadata_update(uuid,text,text,text,bigint) to authenticated;
notify pgrst, 'reload schema';
