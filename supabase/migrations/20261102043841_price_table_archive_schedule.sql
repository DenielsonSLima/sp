-- Existing 90-day history rule runs on the server, independently from page visits.
create index price_tables_archive_due_idx on public.price_tables
  ((list_summary->>'finalizedAt'),company_id,id)
  where list_summary->>'status'='finalized' and list_summary->>'archivedAt' is null
    and list_summary->>'restoredAt' is null;

create function sp_private.archive_expired_price_tables() returns integer
language plpgsql security invoker set search_path='' as $$
declare archived_count integer;
begin
  with expired as (
    select company_id,id from public.price_tables
    where list_summary->>'status'='finalized' and list_summary->>'archivedAt' is null
      and list_summary->>'restoredAt' is null
      and (list_summary->>'finalizedAt')::timestamptz<=now()-interval '90 days'
    order by list_summary->>'finalizedAt',company_id,id limit 200 for update skip locked
  ), archived as (
    update public.price_tables p set
      data=p.data||jsonb_build_object('archivedAt',now(),'updatedAt',now()),
      version=p.version+1,updated_at=now()
    from expired e where p.company_id=e.company_id and p.id=e.id
      and p.list_summary->>'status'='finalized' and p.list_summary->>'archivedAt' is null
      and p.list_summary->>'restoredAt' is null
      and (p.list_summary->>'finalizedAt')::timestamptz<=now()-interval '90 days'
    returning p.company_id,p.id,p.version
  ), logged as (
    insert into public.audit_log(company_id,actor_id,resource,record_id,action,version)
      select company_id,null,'price_tables',id,'archive_expired',version from archived returning 1
  ) select count(*)::integer into archived_count from logged;
  -- AFTER UPDATE keeps summary projection and resource_changes revision current.
  return archived_count;
end $$;
revoke all on function sp_private.archive_expired_price_tables() from public,anon,authenticated;
select cron.schedule('sp-archive-expired-price-tables','*/15 * * * *',
  'select sp_private.archive_expired_price_tables();');
