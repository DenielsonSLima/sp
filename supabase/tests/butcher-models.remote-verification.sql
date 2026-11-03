select jsonb_build_object(
 'migration',(select jsonb_build_object('version',version,'name',name,'statements',cardinality(statements),'md5',md5(array_to_string(statements,E'\n'))) from supabase_migrations.schema_migrations where version='20261102032923'),
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
   'directInsert',has_table_privilege('authenticated',c.oid,'INSERT'),
   'directUpdate',has_table_privilege('authenticated',c.oid,'UPDATE'),
   'directDelete',has_table_privilege('authenticated',c.oid,'DELETE')))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('products','butcher_models','butcher_receipts')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definer',p.prosecdef,'config',p.proconfig,
   'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
   (n.nspname='sp_private' and p.proname in ('validate_animal_model','animal_model_estimate')) or
   (n.nspname='public' and p.proname in ('sp_save','sp_calculate','sp_command'))),
 'realtime',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and tablename='resource_changes'),
 'triggers',(select jsonb_agg(jsonb_build_object('table',event_object_table,'trigger',trigger_name,'event',event_manipulation)) from information_schema.triggers where event_object_schema='public' and event_object_table in ('products','butcher_models','butcher_receipts')),
 'models',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data,'version',version)),'[]') from public.butcher_models),
 'receipts',(select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(id||data::text||version::text,'' order by id),''))) from public.butcher_receipts),
 'products',(select jsonb_agg(jsonb_build_object('id',id,'name',data->>'name','unit',data->>'unit','hash',md5(data::text),'version',version)) from public.products),
 'signals',(select jsonb_agg(jsonb_build_object('resource',resource,'revision',revision)) from public.resource_changes where resource in ('products','butcher_models','butcher_receipts'))
) evidence;
