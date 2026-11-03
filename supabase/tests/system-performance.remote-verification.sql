-- Read-only operational/security verification. Never emits document bodies or image data.
select jsonb_build_object(
 'checked_at',clock_timestamp(),
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations
   where version in ('20261102040347','20261102040438','20261102040852','20261102043841')),
 'rpc_security',(select jsonb_agg(jsonb_build_object('name',p.proname,'invoker',not p.prosecdef,
   'search_path',p.proconfig,'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'anon',has_function_privilege('anon',p.oid,'EXECUTE')) order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('sp_resource_page','sp_campaign_calendar','sp_brand_asset_metadata_update','sp_product_thumbnail_save')),
 'maintenance_denied',not has_function_privilege('authenticated','sp_private.archive_expired_price_tables()','EXECUTE')
   and not has_function_privilege('anon','sp_private.archive_expired_price_tables()','EXECUTE'),
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
   'direct_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in ('products','brand_assets','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','resource_changes')),
 'publication',(select jsonb_agg(tablename order by tablename) from pg_publication_tables where pubname='supabase_realtime'),
 'jobs',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job),
 'summary_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'generated',is_generated))
   from information_schema.columns where table_schema='public' and column_name='list_summary'),
 'products',(select jsonb_agg(jsonb_build_object('id',id,'company',company_id,'version',version,'documentHash',md5(data::text),
   'hasPhoto',has_photos,'thumbnailBytes',coalesce(octet_length(preview_data_url),0),
   'previewMatchesSource',preview_source_hash=md5(sp_private.product_photo_snapshot(data)::text)) order by company_id,id)
   from public.products),
 'documents',(select jsonb_agg(jsonb_build_object('resource',resource,'id',id,'company',company_id,'version',version,'hash',md5(data::text)) order by resource,company_id,id) from (
   select 'quotes' resource,id,company_id,version,data from public.quotes union all
   select 'hortifruti_receipts',id,company_id,version,data from public.hortifruti_receipts union all
   select 'butcher_receipts',id,company_id,version,data from public.butcher_receipts union all
   select 'supplier_returns',id,company_id,version,data from public.supplier_returns union all
   select 'campaigns',id,company_id,version,data from public.campaigns union all
   select 'price_tables',id,company_id,version,data from public.price_tables union all
   select 'flyers',id,company_id,version,data from public.flyers union all
   select 'brand_assets',id,company_id,version,data from public.brand_assets
 ) documents)
) evidence;
