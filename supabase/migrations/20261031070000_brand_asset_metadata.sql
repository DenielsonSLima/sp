-- Keep folder navigation away from the PNG documents. PostgreSQL updates the
-- compact projection with every authorized write, including category renames.
alter table public.brand_assets
 add column metadata jsonb generated always as (data - 'dataURL') stored;

create function sp_private.brand_asset_metadata(company uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.require_access(company,'brand_assets');
 select coalesce(jsonb_agg(metadata||jsonb_build_object('id',id,'_version',version) order by created_at,id),'[]'::jsonb)
 into result from public.brand_assets where company_id=company;
 return result;
end $$;
create function public.sp_brand_asset_metadata(p_company_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$select sp_private.brand_asset_metadata(p_company_id)$$;
revoke all on function sp_private.brand_asset_metadata(uuid),public.sp_brand_asset_metadata(uuid) from public,anon,authenticated;
grant execute on function sp_private.brand_asset_metadata(uuid),public.sp_brand_asset_metadata(uuid) to authenticated;
notify pgrst,'reload schema';
