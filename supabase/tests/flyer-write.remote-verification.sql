-- Read-only verification. No synthetic save or alteration of user documents.
select jsonb_build_object(
 'project', 'enhoierfwuwtzulznjxa',
 'checked_at', now(),
 'history', (select jsonb_build_object('version',version,'name',name,'statements',statements,
   'statements_md5',md5(array_to_string(statements,E'\n')))
   from supabase_migrations.schema_migrations where version='20261102024909'),
 'permissions', jsonb_build_object(
   'anon_rpc',has_function_privilege('anon','public.sp_flyer_save(uuid,jsonb,bigint)','EXECUTE'),
   'authenticated_rpc',has_function_privilege('authenticated','public.sp_flyer_save(uuid,jsonb,bigint)','EXECUTE'),
   'anon_private_save',has_function_privilege('anon','sp_private.save_flyer(uuid,jsonb,bigint)','EXECUTE'),
   'authenticated_validator',has_function_privilege('authenticated','sp_private.validate_flyer_record(jsonb)','EXECUTE'),
   'anon_validator',has_function_privilege('anon','sp_private.validate_flyer_record(jsonb)','EXECUTE'),
   'authenticated_direct_insert',has_table_privilege('authenticated','public.flyers','INSERT'),
   'authenticated_direct_update',has_table_privilege('authenticated','public.flyers','UPDATE'),
   'authenticated_direct_delete',has_table_privilege('authenticated','public.flyers','DELETE')),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,
   'security_definer',p.prosecdef,'config',p.proconfig,'source_md5',md5(pg_get_functiondef(p.oid))))
   from pg_proc p where p.oid in('public.sp_flyer_save(uuid,jsonb,bigint)'::regprocedure,
    'sp_private.save_flyer(uuid,jsonb,bigint)'::regprocedure,'sp_private.validate_flyer_record(jsonb)'::regprocedure)),
 'rows',(select jsonb_build_object('count',count(*),'bytes',sum(octet_length(data::text)),
   'content_versions_md5',md5(string_agg(company_id::text||':'||id||':'||version||':'||md5(data::text),E'\n' order by company_id,id))) from public.flyers),
 'rls',(select relrowsecurity from pg_class where oid='public.flyers'::regclass),
 'signal_trigger',(select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.flyers'::regclass and not tgisinternal),
 'resource_changes_published',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes'),
 'cron',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active,'username',username)) from cron.job where jobname='sp-expire-flyer-drafts')
);
