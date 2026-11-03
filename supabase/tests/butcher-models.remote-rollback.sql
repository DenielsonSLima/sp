-- Invokes real RPCs as authenticated inside an exception subtransaction; all test writes roll back.
create function pg_temp.verify_butcher_model() returns jsonb language plpgsql security invoker as $$
declare company uuid; meat text; foot text; model jsonb; estimate jsonb; saved jsonb; result jsonb; count_before integer;
begin
  select company_id into company from public.memberships where user_id=auth.uid() and active and role='owner';
  select id into meat from public.products where company_id=company and data->>'name'='CARNE BOV. PICANHA KG';
  select id into foot from public.products where company_id=company and data->>'name'='MOCOTÓ BOV. UND';
  select count(*) into count_before from public.butcher_models where company_id=company;
  begin
    model:=public.sp_save(company,'butcher_models',jsonb_build_object('name','Verificação descartável',
      'species','bovine','sex','male','parts',jsonb_build_array(
        jsonb_build_object('productId',meat,'percent','2,5'),
        jsonb_build_object('productId',foot,'quantityPerAnimal','4'))),null);
    model:=public.sp_save(company,'butcher_models',jsonb_build_object('id',model->>'id','action','setCurrent'),(model->>'_version')::bigint);
    estimate:=public.sp_calculate(company,'butcher',jsonb_build_object('category',model->>'category','weight','750','animalCount','3','receivedDate','2026-11-02'));
    if estimate#>>'{rows,0,estimatedGrams}'<>'18750' or estimate#>>'{rows,1,quantity}'<>'12' or estimate#>'{rows,1,estimatedGrams}'<>'null'::jsonb then
      raise exception 'Resultado remoto inesperado.';
    end if;
    saved:=public.sp_command(company,'butcher_receipts','create',null,
      jsonb_build_object('category',model->>'category','weight','750','animalCount','3','receivedDate','2026-11-02',
        'expectedModelId',model->>'id','expectedModelVersion',model->'_version'),null);
    result:=jsonb_build_object('calculatedKgGrams',estimate#>'{rows,0,estimatedGrams}','unitQuantity',estimate#>'{rows,1,quantity}',
      'unitWeightIsNull',estimate#>'{rows,1,estimatedGrams}'='null'::jsonb,'receiptCreated',saved->>'id' is not null,
      'authenticated',current_user='authenticated');
    raise exception using errcode='Z0001',message='Rollback verification';
  exception when sqlstate 'Z0001' then null;
  end;
  return result||jsonb_build_object('modelCountPreserved',count_before=(select count(*) from public.butcher_models where company_id=company));
end $$;
select set_config('request.jwt.claim.sub',(select m.user_id::text from public.memberships m join public.companies c on c.id=m.company_id where c.name='Supermercado do Povo' and m.role='owner' and m.active limit 1),false);
set role authenticated;
select pg_temp.verify_butcher_model() evidence;
