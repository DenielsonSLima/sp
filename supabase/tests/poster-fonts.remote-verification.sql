select
  (select md5(coalesce(string_agg(company_id::text || id || data::text || version::text, '|' order by company_id, id), '')) from public.poster_templates) as templates_checksum,
  (select count(*) from public.poster_templates) as template_count,
  (select relrowsecurity from pg_class where oid='public.poster_templates'::regclass) as rls,
  (select count(*) from pg_policy where polrelid='public.poster_templates'::regclass) as policy_count,
  (select count(*) from pg_trigger where tgrelid='public.poster_templates'::regclass and not tgisinternal) as trigger_count,
  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='resource_changes') as realtime,
  has_function_privilege('anon','sp_private.validate_template(jsonb)','execute') as anon_validator_execute,
  has_function_privilege('authenticated','sp_private.validate_template(jsonb)','execute') as authenticated_validator_execute,
  (select prosecdef from pg_proc where oid='sp_private.validate_template(jsonb)'::regprocedure) as validator_security_definer,
  (select proconfig from pg_proc where oid='sp_private.validate_template(jsonb)'::regprocedure) as validator_config;
