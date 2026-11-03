-- Read-only inventory plus synthetic authenticated operations inside a rolled-back
-- subtransaction. No purchase, model or Realtime signal from this test is retained.
select jsonb_build_object(
  'migration',exists(select 1 from supabase_migrations.schema_migrations where version='20261103004241'),
  'receiptRls',(select relrowsecurity from pg_class where oid='public.butcher_receipts'::regclass),
  'anonCalculate',has_function_privilege('anon','public.sp_calculate(uuid,text,jsonb)','EXECUTE'),
  'authenticatedCalculate',has_function_privilege('authenticated','public.sp_calculate(uuid,text,jsonb)','EXECUTE'),
  'directInsert',has_table_privilege('authenticated','public.butcher_receipts','INSERT'),
  'privateEstimateExecutable',has_function_privilege('authenticated','sp_private.butcher_estimate(uuid,jsonb)','EXECUTE'),
  'privateYieldExecutable',has_function_privilege('authenticated','sp_private.butcher_yield_estimate(uuid,jsonb)','EXECUTE'),
  'signalsPublished',exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes'),
  'purchaseSummarySupported',position('purchaseTotalCents' in
    pg_get_functiondef('sp_private.resource_summary(text,jsonb)'::regprocedure))>0
) inventory;

create function pg_temp.verify_butcher_entry() returns jsonb language plpgsql security invoker as $$
declare
  company uuid;
  product_id text;
  model jsonb;
  preview jsonb;
  saved jsonb;
  input jsonb;
  evidence jsonb;
  before_models text;
  before_receipts text;
  before_signals text;
begin
  select c.id into strict company from public.companies c
    join public.memberships m on m.company_id=c.id
    where c.name='Supermercado do Povo' and m.user_id=auth.uid() and m.active and m.role='owner';
  select p.id into product_id from public.products p where p.company_id=company
    and p.data->>'name'='CARNE BOV. PICANHA KG' limit 1;
  if product_id is null then raise exception 'Produto cadastrado necessário para a conferência.'; end if;
  select md5(coalesce(string_agg(id||data::text||version::text,'' order by id),'')) into before_models
    from public.butcher_models where company_id=company;
  select md5(coalesce(string_agg(id||data::text||version::text,'' order by id),'')) into before_receipts
    from public.butcher_receipts where company_id=company;
  select md5(coalesce(string_agg(resource||revision::text,'' order by resource),'')) into before_signals
    from public.resource_changes where company_id=company;
  begin
    model := public.sp_save(company,'butcher_models',jsonb_build_object(
      'name','Conferência descartável de entrada','species','bovine',
      'parts',jsonb_build_array(jsonb_build_object('productId',product_id,'percent','2,5'))),null);
    model := public.sp_save(company,'butcher_models',jsonb_build_object('id',model->>'id','action','setCurrent'),
      (model->>'_version')::bigint);
    input := jsonb_build_object('category',model->>'category','animalCount','2','receivedDate','2026-11-02',
      'weightMode','parts','purchaseTotal','12.345,67','notes','Teste integralmente revertido',
      'expectedModelId',model->>'id','expectedModelVersion',model->'_version',
      'sections',jsonb_build_array(
        jsonb_build_object('type','forequarter','side','left','quantity','2','weight','80'),
        jsonb_build_object('type','forequarter','side','right','quantity','2','weight','80'),
        jsonb_build_object('type','hindquarter','side','left','quantity','2','weight','120'),
        jsonb_build_object('type','hindquarter','side','right','quantity','2','weight','120')));
    preview := public.sp_calculate(company,'butcher',input);
    if (preview->>'weightGrams')::numeric<>400000 or (preview->>'purchaseTotalCents')::numeric<>1234567
      or (preview->>'purchaseCostPerKgCents')::numeric<>3086
      or (preview#>>'{rows,0,estimatedGrams}')::numeric<>10000
      or (select sum((s->>'allocatedCostCents')::numeric) from jsonb_array_elements(preview->'sections') s)<>1234567 then
      raise exception 'Cálculo remoto inesperado.';
    end if;
    saved := public.sp_command(company,'butcher_receipts','create',null,input,null);
    if public.sp_get(company,'butcher_receipts',saved->>'id') is distinct from saved then
      raise exception 'Snapshot remoto não corresponde à gravação.';
    end if;
    evidence := jsonb_build_object('authenticated',current_user='authenticated',
      'weightGrams',preview->'weightGrams','purchaseTotalCents',preview->'purchaseTotalCents',
      'purchaseCostPerKgCents',preview->'purchaseCostPerKgCents',
      'sections',preview->'sections','estimatedCutGrams',preview#>'{rows,0,estimatedGrams}',
      'receiptRoundTrip',true);
    raise exception using errcode='Z0001',message='Rollback synthetic butcher entry';
  exception when sqlstate 'Z0001' then null;
  end;
  return evidence || jsonb_build_object(
    'modelsPreserved',before_models=(select md5(coalesce(string_agg(id||data::text||version::text,'' order by id),''))
      from public.butcher_models where company_id=company),
    'receiptsPreserved',before_receipts=(select md5(coalesce(string_agg(id||data::text||version::text,'' order by id),''))
      from public.butcher_receipts where company_id=company),
    'signalsPreserved',before_signals=(select md5(coalesce(string_agg(resource||revision::text,'' order by resource),''))
      from public.resource_changes where company_id=company));
end $$;
select set_config('request.jwt.claim.sub',(
  select m.user_id::text from public.memberships m join public.companies c on c.id=m.company_id
  where c.name='Supermercado do Povo' and m.role='owner' and m.active limit 1),false);
set role authenticated;
select pg_temp.verify_butcher_entry() evidence;
reset role;
