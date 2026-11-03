-- Keep catalog queries off the large, triplicated legacy photo document.
-- PostgreSQL maintains these small projections on every product write.
alter table public.products
 add column metadata jsonb generated always as (data - array['photos','photo','image','hasPhotos']) stored,
 add column has_photos boolean generated always as (coalesce(jsonb_array_length(data->'photos'),0)>0) stored;

create or replace function sp_private.list_records(company uuid,resource text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource);
 if resource='products' then
 select coalesce(jsonb_agg(metadata||jsonb_build_object('id',id,'_version',version,'hasPhotos',has_photos) order by created_at,id),'[]'::jsonb)
 into result from public.products where company_id=company;
 elsif resource='user_access' then
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'profile',p.data->>'name','profileId',m.profile_id,'role',m.role,'active',m.active,'_version',m.version) order by m.created_at),'[]'::jsonb)
 into result from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id where m.company_id=company;
 else
 execute format('select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by created_at,id),''[]''::jsonb) from public.%I where company_id=$1',resource) into result using company;
 end if;return result;
end $$;

create or replace function sp_private.read_record(company uuid,resource text,key text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource);
 if resource='products' then
 select metadata||jsonb_build_object('id',id,'_version',version,'hasPhotos',has_photos,'photos',coalesce(data->'photos','[]'::jsonb))
 into result from public.products where company_id=company and id=key;
 elsif resource='user_access' then
 select jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'profile',p.data->>'name','profileId',m.profile_id,'role',m.role,'active',m.active,'_version',m.version)
 into result from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id where m.company_id=company and m.user_id::text=key;
 else
 execute format('select data||jsonb_build_object(''id'',id,''_version'',version) from public.%I where company_id=$1 and id=$2',resource) into result using company,key;
 end if;return result;
end $$;

create function sp_private.product_media(company uuid,keys text[]) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.require_access(company,'products');
 if keys is null or cardinality(keys)>8 or coalesce(array_ndims(keys),1)<>1 then raise exception 'Solicite fotos de até 8 produtos por vez.';end if;
 if exists(select 1 from unnest(keys) id where id is null or id !~ '^[A-Za-z0-9_-]{1,100}$' or id in ('__proto__','constructor','prototype')) then raise exception 'Identificador de produto inválido.';end if;
 if exists(select 1 from public.products where company_id=company and id=any(keys) and (coalesce(jsonb_typeof(data->'photos'),'null')<>'array' or jsonb_array_length(data->'photos')>5)) then raise exception 'Galeria de fotos inválida no catálogo.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'_version',version,'photos',coalesce(data->'photos','[]'::jsonb)) order by array_position(keys,id)),'[]'::jsonb)
 into result from public.products where company_id=company and id=any(keys);
 return result;
end $$;
create function public.sp_product_media(p_company_id uuid,p_ids text[]) returns jsonb
 language sql stable security invoker set search_path='' as $$select sp_private.product_media(p_company_id,p_ids)$$;
revoke all on function sp_private.product_media(uuid,text[]),public.sp_product_media(uuid,text[]) from public,anon,authenticated;
grant execute on function sp_private.product_media(uuid,text[]),public.sp_product_media(uuid,text[]) to authenticated;
notify pgrst,'reload schema';
