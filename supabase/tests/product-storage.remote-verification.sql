with imported as(select * from public.products where company_id='89d1d8c9-b03d-46aa-a743-deac900f93b3'::uuid and lower(data->>'code') like 'cat26-%'), assets as(select p.id,p.version,p.data->>'code' as code,a from imported p cross join lateral jsonb_array_elements(coalesce(p.data->'photoAssets','[]'::jsonb)) a)
select jsonb_build_object(
 'project','enhoierfwuwtzulznjxa',
 'products_total',(select count(*) from public.products where company_id='89d1d8c9-b03d-46aa-a743-deac900f93b3'::uuid),
 'imported_products',(select count(*) from imported),
 'imported_photos',(select count(*) from assets),
 'products_with_exactly_three_views',(select count(*) from imported where jsonb_array_length(data->'photoAssets')=3 and (select array_agg(a->>'angle' order by a->>'angle') from jsonb_array_elements(data->'photoAssets') a)=array['front','left','right']),
 'inline_images_on_new_products',(select count(*) from imported where coalesce(jsonb_array_length(data->'photos'),0)>0),
 'missing_storage_objects',(select count(*) from assets a left join storage.objects o on o.bucket_id=a.a->>'bucket' and o.name=a.a->>'path' where o.id is null),
 'invalid_asset_metadata',(select count(*) from assets a join storage.objects o on o.bucket_id=a.a->>'bucket' and o.name=a.a->>'path' where o.metadata->>'mimetype'<>'image/png' or o.metadata->>'size' is distinct from a.a->>'size' or a.a->>'source'<>'generated' or (a.a->>'width')::int<1024 or (a.a->>'height')::int<1024),
 'bucket',(select jsonb_build_object('name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) from storage.buckets where id='product-photos'),
 'resource_signal',(select jsonb_build_object('resource',resource,'revision',revision) from public.resource_changes where company_id='89d1d8c9-b03d-46aa-a743-deac900f93b3'::uuid and resource='products')
) as verification;
