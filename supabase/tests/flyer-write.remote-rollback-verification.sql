-- CLI-only disposable RPC measurement. The helper exists only for this connection.
-- Its subtransaction is ALWAYS rolled back, including audit and resource signal.
create or replace function pg_temp.verify_flyer_save_rollback()
returns jsonb language plpgsql set search_path='' as $qa$
declare
 source_row record;
 target_id text := 'qa-flyer-' || gen_random_uuid()::text;
 sent jsonb;
 ack jsonb;
 read_back jsonb;
 report jsonb;
 explained jsonb;
 plan_row record;
 initial_rows jsonb;
 final_rows jsonb;
 qa_rows bigint;
 qa_audits bigint;
begin
 if current_user <> 'authenticated' then raise exception 'QA requires authenticated invoker';end if;
 select company_id,id,version,data into source_row from public.flyers
 where id='410cf46b-871e-43e3-85df-1ea34d83e660';
 if not found then raise exception 'QA source unavailable to authenticated owner';end if;
 if exists(select 1 from public.flyers where id=target_id) then raise exception 'QA target already exists';end if;
 select jsonb_build_object('count',count(*),'versions_content_md5',
  md5(string_agg(id||':'||version||':'||md5(data::text),E'\n' order by id))) into initial_rows
 from public.flyers where company_id=source_row.company_id and id not like 'qa-flyer-%';
 sent := (source_row.data-array['_version','computed','action']) || jsonb_build_object('id',target_id);
 begin
  for plan_row in execute
   'explain (analyze,buffers,format json) select set_config(''qa.flyer_ack'',public.sp_flyer_save($1,$2,null)::text,true)'
   using source_row.company_id,sent
  loop explained := plan_row."QUERY PLAN";end loop;
  ack := current_setting('qa.flyer_ack')::jsonb;
  if ack->>'id' is distinct from target_id or (ack->>'_version')::bigint <> 1 then
   raise exception 'QA acknowledgement does not match disposable target';
  end if;
  read_back := public.sp_get(source_row.company_id,'flyers',target_id);
  if (read_back-'_version') is distinct from sent then raise exception 'QA read-back differs from sent snapshot';end if;
  report := jsonb_build_object('project','enhoierfwuwtzulznjxa','checked_at',clock_timestamp(),
   'role',current_user,'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'),
   'source',jsonb_build_object('id',source_row.id,'version',source_row.version,'json_bytes',octet_length(source_row.data::text),'content_md5',md5(source_row.data::text)),
   'target_id',target_id,'ack',ack,'ack_bytes',octet_length(ack::text),'readback_exact',true,
   'snapshot_json_bytes',octet_length(sent::text),'snapshot_md5',md5(sent::text),'readback_md5',md5((read_back-'_version')::text),
   'explain',explained);
  -- Deliberate exception rolls back only the disposable save and all its effects.
  raise exception using errcode='QA001',message='Rollback disposable flyer verification';
 exception when sqlstate 'QA001' then null;
 end;
 select count(*) into qa_rows from public.flyers where id=target_id;
 select count(*) into qa_audits from public.audit_log where resource='flyers' and record_id=target_id;
 if qa_rows <> 0 or qa_audits <> 0 then raise exception 'Disposable QA save survived rollback';end if;
 select jsonb_build_object('count',count(*),'versions_content_md5',
  md5(string_agg(id||':'||version||':'||md5(data::text),E'\n' order by id))) into final_rows
 from public.flyers where company_id=source_row.company_id and id not like 'qa-flyer-%';
 return report || jsonb_build_object('rolled_back',true,'qa_rows_after_rollback',qa_rows,'qa_audits_after_rollback',qa_audits,
  'original_rows_before',initial_rows,'original_rows_after',final_rows,'original_rows_unchanged',initial_rows=final_rows);
end $qa$;
revoke all on function pg_temp.verify_flyer_save_rollback() from public;
grant execute on function pg_temp.verify_flyer_save_rollback() to authenticated;
-- The CLI connection closes after the final result; session-only settings expire.
select set_config('request.jwt.claim.sub',m.user_id::text,false)
from public.memberships m join public.flyers f on f.company_id=m.company_id
where m.role='owner' and m.active and f.id='410cf46b-871e-43e3-85df-1ea34d83e660' limit 1;
set statement_timeout='8s';
set lock_timeout='2s';
set role authenticated;
select pg_temp.verify_flyer_save_rollback() as verification;
