-- Library reads never pull the embedded images/elements of every document.
-- The generated projection is refreshed by every normal versioned RPC write.
alter table public.flyers
 add column library_metadata jsonb generated always as (data - 'elements') stored;

create function sp_private.flyer_library(company uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.require_access(company,'flyers');
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'title',library_metadata->>'title','status',library_metadata->>'status',
  'width',library_metadata->'width','height',library_metadata->'height',
  'createdAt',created_at,'updatedAt',updated_at,'_version',version,
  'expiresAt',case when library_metadata->>'status'='draft' then updated_at+interval '15 days' else null end
 ) order by updated_at desc,id),'[]'::jsonb)
 into result from public.flyers where company_id=company;
 return result;
end $$;
create function public.sp_flyer_library(p_company_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$select sp_private.flyer_library(p_company_id)$$;
revoke all on function sp_private.flyer_library(uuid),public.sp_flyer_library(uuid) from public,anon,authenticated;
grant execute on function sp_private.flyer_library(uuid),public.sp_flyer_library(uuid) to authenticated;

-- Only unfinished drafts expire, measured from the server's last successful
-- write. A partial index avoids scanning completed arts and embedded snapshots.
create index flyers_draft_retention_idx on public.flyers(updated_at,company_id,id)
 where library_metadata->>'status'='draft';

-- Administrative maintenance only: no public RPC and no application grants.
-- Invoker privileges mean only the database/job owner can bypass tenant RLS.
-- Bound each run; skip documents currently being edited rather than blocking.
create function sp_private.expire_flyer_drafts() returns integer
 language plpgsql security invoker set search_path='' as $$
 declare deleted_count integer;begin
 with expired as (
  select company_id,id from public.flyers
  where library_metadata->>'status'='draft' and updated_at<=now()-interval '15 days'
  order by updated_at,company_id,id limit 200 for update skip locked
 ),deleted as (
  delete from public.flyers f using expired e
  where f.company_id=e.company_id and f.id=e.id
   and f.library_metadata->>'status'='draft' and f.updated_at<=now()-interval '15 days'
  returning f.company_id,f.id,f.version
 ),logged as (
  insert into public.audit_log(company_id,actor_id,resource,record_id,action,version)
  select company_id,null,'flyers',id,'expire_draft',version from deleted returning 1
 ) select count(*)::integer into deleted_count from logged;
 -- Existing AFTER DELETE trigger increments company/resource_changes, so open
 -- libraries invalidate normally. Images are inline snapshots, not Storage files.
 return deleted_count;
end $$;
revoke all on function sp_private.expire_flyer_drafts() from public,anon,authenticated;

-- Keep cleanup independent of any browser session. Named scheduling replaces an
-- existing job of the same name instead of creating duplicates if reconfigured.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('sp-expire-flyer-drafts','*/15 * * * *','select sp_private.expire_flyer_drafts();');
notify pgrst,'reload schema';
