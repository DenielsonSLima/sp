begin;
select set_config('request.jwt.claim.sub','05f7c1f7-f2cc-4b12-b56e-89cddb221847',true);
set local role authenticated;
with page as (
  select public.sp_product_page_filtered(
    '89d1d8c9-b03d-46aa-a743-deac900f93b3', 1, 20, '', array['Mercearia','Bebidas'], '{}'
  ) payload
), expected as (
  select count(*) total from public.products
  where company_id = '89d1d8c9-b03d-46aa-a743-deac900f93b3'
    and metadata->>'category' in ('Mercearia','Bebidas')
)
select jsonb_build_object(
  'project', 'enhoierfwuwtzulznjxa',
  'anon_execute', has_function_privilege('anon', 'public.sp_product_page_filtered(uuid,integer,integer,text,text[],text[])','execute'),
  'authenticated_execute', has_function_privilege('authenticated', 'public.sp_product_page_filtered(uuid,integer,integer,text,text[],text[])','execute'),
  'products_rls', (select relrowsecurity from pg_class where oid='public.products'::regclass),
  'realtime_signal', exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='resource_changes'),
  'filtered_total', payload->'total',
  'expected_total', expected.total,
  'totals_match', (payload->>'total')::integer = expected.total,
  'page_items', jsonb_array_length(payload->'items'),
  'metadata_only', not exists (
    select 1 from jsonb_array_elements(payload->'items') p
    where p ?| array['photos','photoAssets','image','photo']
  ),
  'correct_categories', not exists (
    select 1 from jsonb_array_elements(payload->'items') p
    where p->>'category' not in ('Mercearia','Bebidas')
  )
) verification from page, expected;
rollback;
