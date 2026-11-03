-- Read-only verification through the authorized CLI connection. No quote is saved.
do $verify$
declare report jsonb; owner_id uuid;
begin
  select user_id into strict owner_id from public.memberships
  where company_id='89d1d8c9-b03d-46aa-a743-deac900f93b3' and role='owner' and active limit 1;
  select jsonb_build_object(
    'migrationApplied',exists(select 1 from supabase_migrations.schema_migrations where version='20261102031736'),
    'rls',(select relrowsecurity from pg_class where oid='public.quotes'::regclass),
    'historyIndex',exists(select 1 from pg_indexes where schemaname='public' and indexname='quotes_history_order_idx'),
    'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'securityDefiner',p.prosecdef,
      'config',p.proconfig,'authenticatedExecute',has_function_privilege('authenticated',p.oid,'execute'),
      'anonExecute',has_function_privilege('anon',p.oid,'execute')))
      from pg_proc p where p.oid in ('public.sp_get(uuid,text,text)'::regprocedure,
        'public.sp_command(uuid,text,text,text,jsonb,bigint)'::regprocedure,
        'sp_private.quote_with_price_history(uuid,jsonb)'::regprocedure)),
    'quoteTriggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger
      where tgrelid='public.quotes'::regclass and not tgisinternal),
    'resourceChangesPublished',exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes'),
    'originalHashes',(select jsonb_agg(jsonb_build_object('id',id,'version',version,'hash',md5(data::text)))
      from public.quotes)
  ) into report;
  perform set_config('qa.quote_history_metadata',report::text,false);
  perform set_config('request.jwt.claim.sub',owner_id::text,false);
end $verify$;
set statement_timeout='8s';
set role authenticated;
with response as (
  select public.sp_get('89d1d8c9-b03d-46aa-a743-deac900f93b3','quotes','c05a6812-4244-4308-9986-f5084b967b61') doc
)
select current_setting('qa.quote_history_metadata')::jsonb || jsonb_build_object(
  'project','enhoierfwuwtzulznjxa','checkedAt',clock_timestamp(),'role',current_user,
  'responseId',doc->>'id','responseVersion',doc->'_version','priceHistory',doc#>'{computed,priceHistory}'
) as verification from response;
