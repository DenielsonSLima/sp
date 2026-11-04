-- Run only in project enhoierfwuwtzulznjxa. Synthetic records/audit/signals are rolled back.
select jsonb_build_object(
  'project','enhoierfwuwtzulznjxa',
  'migration',exists(select 1 from supabase_migrations.schema_migrations where version='20261104012757'),
  'priceRls',(select relrowsecurity from pg_class where oid='public.price_tables'::regclass),
  'readPolicyCount',(select count(*) from pg_policies where schemaname='public' and tablename='price_tables'),
  'triggerCount',(select count(*) from pg_trigger where tgrelid='public.price_tables'::regclass and not tgisinternal),
  'anonCommand',has_function_privilege('anon','public.sp_command(uuid,text,text,text,jsonb,bigint)','execute'),
  'authenticatedCommand',has_function_privilege('authenticated','public.sp_command(uuid,text,text,text,jsonb,bigint)','execute'),
  'directWrite',has_table_privilege('authenticated','public.price_tables','insert,update,delete'),
  'privateCommandExecutable',has_function_privilege('authenticated','sp_private.price_promotion_command(uuid,text,text,jsonb,bigint)','execute'),
  'privateValidatorExecutable',has_function_privilege('authenticated','sp_private.validate_price_promotion(uuid,jsonb)','execute'),
  'signalsPublished',exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='resource_changes'),
  'archiveSchedule',(select count(*) from cron.job where command='select sp_private.archive_expired_price_tables();' and active)
) inventory;

create function pg_temp.verify_price_promotions() returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  company uuid; products jsonb; model text; doc jsonb; line jsonb; report jsonb; key text;
  before_prices text; before_products text; before_signals text; before_audit bigint;
  before_delete bigint; after_delete bigint; before_failed jsonb; failed boolean := false;
begin
  if current_user<>'authenticated' then raise exception 'Use authenticated role.'; end if;
  select c.id into strict company from public.companies c join public.memberships m on m.company_id=c.id
    where c.name='Supermercado do Povo' and m.user_id=auth.uid() and m.active and m.role='owner';
  select jsonb_agg(id order by id) into products from
    (select id from public.products where company_id=company order by id limit 2) chosen;
  select id into model from public.poster_templates where company_id=company order by id limit 1;
  if jsonb_array_length(products)<>2 or model is null then raise exception 'Required catalogs not available.'; end if;
  select md5(coalesce(string_agg(id||version::text||md5(data::text),'' order by id),'')) into before_prices from public.price_tables where company_id=company;
  select md5(coalesce(string_agg(id||version::text||md5(metadata::text),'' order by id),'')) into before_products from public.products where company_id=company;
  select md5(coalesce(string_agg(resource||revision::text,'' order by resource),'')) into before_signals from public.resource_changes where company_id=company;
  select count(*) into before_audit from public.audit_log where company_id=company;
  begin
    doc := public.sp_command(company,'price_tables','createPromotion',null,
      jsonb_build_object('name','QA promoção descartável','start','2026-11-03','end','2026-11-10','notes','Verificação com rollback'),null);
    key := doc->>'id';
    doc := public.sp_command(company,'price_tables','addProducts',key,jsonb_build_object('productIds',products),(doc->>'_version')::bigint);
    if jsonb_array_length(doc->'items')<>2 then raise exception 'Batch addition failed.'; end if;
    before_failed := doc;
    begin
      perform public.sp_command(company,'price_tables','removeProducts',key,
        jsonb_build_object('itemIds',jsonb_build_array(doc#>>'{items,0,id}','missing-item')),(doc->>'_version')::bigint);
    exception when raise_exception then failed := true;
    end;
    if not failed or public.sp_get(company,'price_tables',key) is distinct from before_failed then
      raise exception 'Removal batch was not atomic.';
    end if;
    for line in select value from jsonb_array_elements(doc->'items') loop
      doc := public.sp_command(company,'price_tables','updateProduct',key,jsonb_build_object('itemId',line->>'id',
        'input',jsonb_build_object('priceRaw','1.234,50','templateId',model,'quantity',1,'printLayout','individual')),(doc->>'_version')::bigint);
    end loop;
    doc := public.sp_command(company,'price_tables','send',null,jsonb_build_object('keys',jsonb_build_array(key),
      'expectedVersions',jsonb_build_object(key,doc->'_version')),null)->0;
    if doc->>'status'<>'sent' or (doc#>>'{items,0,cents}')::numeric<>123450 then raise exception 'Transition or BRL cents failed.'; end if;
    doc := public.sp_command(company,'price_tables','reopen',key,'{}',(doc->>'_version')::bigint);
    select revision into before_delete from public.resource_changes where company_id=company and resource='price_tables';
    perform public.sp_command(company,'price_tables','deletePromotion',key,'{}',(doc->>'_version')::bigint);
    select revision into after_delete from public.resource_changes where company_id=company and resource='price_tables';
    if public.sp_get(company,'price_tables',key) is not null or after_delete<>before_delete+1 then raise exception 'Deletion or signal failed.'; end if;
    report := jsonb_build_object('role',current_user,'company',company,'headerCreated',true,'batchSize',2,
      'removeBatchAtomic',true,'sendReopen',true,'priceCents',123450,'deleteSignal',true,'discardedId',key);
    raise exception using errcode='Z0001',message='Rollback synthetic price promotion';
  exception when sqlstate 'Z0001' then null;
  end;
  return report||jsonb_build_object('rolledBack',true,
    'pricesPreserved',before_prices=(select md5(coalesce(string_agg(id||version::text||md5(data::text),'' order by id),'')) from public.price_tables where company_id=company),
    'productsPreserved',before_products=(select md5(coalesce(string_agg(id||version::text||md5(metadata::text),'' order by id),'')) from public.products where company_id=company),
    'signalsPreserved',before_signals=(select md5(coalesce(string_agg(resource||revision::text,'' order by resource),'')) from public.resource_changes where company_id=company),
    'auditPreserved',before_audit=(select count(*) from public.audit_log where company_id=company));
end $$;
revoke all on function pg_temp.verify_price_promotions() from public;
grant execute on function pg_temp.verify_price_promotions() to authenticated;
select set_config('request.jwt.claim.sub',(
  select m.user_id::text from public.memberships m join public.companies c on c.id=m.company_id
    where c.name='Supermercado do Povo' and m.role='owner' and m.active limit 1),false);
set role authenticated;
select pg_temp.verify_price_promotions() evidence;
reset role;
