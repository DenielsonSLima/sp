with sample as (
  select sp_private.quote_computed('{"providers":[{"id":"supplier","name":"Fornecedor sintético"}],"items":[{"id":"item","name":"Produto sintético","quantity":2}],"offers":{"item":{"supplier":1000}},"awards":{"item":"supplier"},"itemDiscounts":{"item":{"supplier":{"type":"percent","value":1000}}},"providerDiscounts":{"supplier":{"type":"amount","value":301}}}'::jsonb) result
)
select jsonb_build_object(
  'project','enhoierfwuwtzulznjxa',
  'migration_md5',(select md5(statements[1]) from supabase_migrations.schema_migrations where version='20261102013854'),
  'gross',result#>'{awardedByProvider,0,grossTotal}',
  'item_discount',result#>'{awardedByProvider,0,itemDiscountTotal}',
  'supplier_discount',result#>'{awardedByProvider,0,discountTotal}',
  'net',result->'selectedTotal',
  'public_definer',(select prosecdef from pg_proc where oid='public.sp_command(uuid,text,text,text,jsonb,bigint)'::regprocedure),
  'private_definer',(select prosecdef from pg_proc where oid='sp_private.set_quote_discount(uuid,text,jsonb,bigint)'::regprocedure),
  'private_search_path',(select proconfig from pg_proc where oid='sp_private.set_quote_discount(uuid,text,jsonb,bigint)'::regprocedure),
  'authenticated_direct_insert',has_table_privilege('authenticated','public.quotes','insert'),
  'authenticated_direct_update',has_table_privilege('authenticated','public.quotes','update'),
  'anon_execute',has_function_privilege('anon','public.sp_command(uuid,text,text,text,jsonb,bigint)','execute'),
  'quote_rows',(select count(*) from public.quotes)
) as verification from sample;
