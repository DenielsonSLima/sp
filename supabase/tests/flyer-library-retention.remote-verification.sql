-- Read-only postflight for authorized project enhoierfwuwtzulznjxa via CLI.
-- A transaction-local owner auth subject exercises require_access; no durable data is changed.
with owner_context as materialized (
 select company_id, set_config('request.jwt.claim.sub',user_id::text,true) as session_subject
 from public.memberships where role='owner' and active order by created_at limit 1
), library as materialized (
 select public.sp_flyer_library(company_id) as metadata from owner_context
)
select jsonb_build_object(
 'migrationHistory',(select jsonb_build_object('version',version,'name',name,'statements',statements,'joinedStatementsMd5',md5(array_to_string(statements,E'\n'))) from supabase_migrations.schema_migrations where version='20261102005446'),
 'tables',(select jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('flyers','resource_changes')),
 'metadataColumn',(select jsonb_build_object('generated',is_generated,'expression',generation_expression) from information_schema.columns where table_schema='public' and table_name='flyers' and column_name='library_metadata'),
 'retentionIndex',(select indexdef from pg_indexes where schemaname='public' and indexname='flyers_draft_retention_idx'),
 'functionGrants',jsonb_build_object('anonLibrary',has_function_privilege('anon','public.sp_flyer_library(uuid)','execute'),'authenticatedLibrary',has_function_privilege('authenticated','public.sp_flyer_library(uuid)','execute'),'anonMaintenance',has_function_privilege('anon','sp_private.expire_flyer_drafts()','execute'),'authenticatedMaintenance',has_function_privilege('authenticated','sp_private.expire_flyer_drafts()','execute')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'securityDefiner',p.prosecdef,'config',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname='sp_flyer_library') or (n.nspname='sp_private' and p.proname in ('flyer_library','expire_flyer_drafts'))),
 'cronExtension',(select coalesce(jsonb_agg(jsonb_build_object('name',extname,'version',extversion)),'[]'::jsonb) from pg_extension where extname='pg_cron'),
 'cronJobs',(select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'command',command,'active',active,'database',database,'owner',username)),'[]'::jsonb) from cron.job where jobname='sp-expire-flyer-drafts'),
 'cronRuns',(select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) from (select status,return_message,start_time,end_time from cron.job_run_details where jobid in(select jobid from cron.job where jobname='sp-expire-flyer-drafts') order by start_time desc limit 3) r),
 'records',(select jsonb_build_object('totalArts',count(*),'drafts',count(*) filter(where library_metadata->>'status'='draft'),'completed',count(*) filter(where library_metadata->>'status'='created'),'expiredDrafts',count(*) filter(where library_metadata->>'status'='draft' and updated_at<=now()-interval '15 days'),'contentHash',md5(coalesce(string_agg(company_id::text||':'||id||':'||version::text||':'||md5(data::text),'|' order by company_id,id),'')),'fullDocumentJsonBytes',coalesce(sum(octet_length(data::text)),0)) from public.flyers),
 'rpcPayload',(select jsonb_build_object('records',jsonb_array_length(metadata),'jsonBytes',octet_length(metadata::text),'includesElements',exists(select 1 from jsonb_array_elements(metadata) entry where entry?'elements'),'includesBase64',metadata::text like '%base64,%') from library),
 'signalTrigger',(select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.flyers'::regclass and tgname='signal_resource_change' and not tgisinternal),
 'realtimeSignalPublished',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes')
) as verification;
