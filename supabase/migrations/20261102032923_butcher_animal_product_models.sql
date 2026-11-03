-- Product-backed animal models. Existing models/receipts retain their legacy semantics.
create function sp_private.validate_animal_model(company uuid, input jsonb, old jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  species text := input->>'species'; sex text := input->>'sex'; label text;
  item jsonb; product jsonb; unit jsonb; symbol text; parts jsonb := '[]';
  bps numeric; qty numeric; total numeric := 0;
begin
  perform sp_private.require_access(company,'butcher_models',true);
  label := case species when 'bovine' then 'Bovino' when 'swine' then 'Suíno'
    when 'caprine' then 'Caprino' when 'ovine' then 'Ovino' when 'poultry' then 'Aves' end;
  if label is null or sex is null or sex not in ('male','female') then
    raise exception 'Selecione a espécie animal e o sexo.';
  end if;
  if old is not null and (old->>'species' is distinct from species or old->>'sex' is distinct from sex) then
    raise exception 'Crie outro modelo para alterar a espécie ou o sexo.';
  end if;
  if length(trim(coalesce(input->>'name',''))) not between 1 and 80
    or jsonb_typeof(input->'parts') is distinct from 'array' then raise exception 'Nome ou composição inválidos.'; end if;
  if jsonb_array_length(input->'parts')>100 then raise exception 'Use até 100 produtos.'; end if;
  for item in select value from jsonb_array_elements(input->'parts') loop
    product := sp_private.catalog(company,'products',item->>'productId');
    unit := sp_private.catalog(company,'units',product->>'unit');
    symbol := upper(unit->>'symbol');
    if symbol not in ('KG','UN','UND') then raise exception 'Selecione produtos em KG ou UND.'; end if;
    bps := 0; qty := null;
    if symbol='KG' then
      bps := sp_private.decimal_scaled(item->>'percent',2,'Rendimento');
      if bps<=0 or bps>10000 then raise exception 'Informe um rendimento maior que zero e até 100%%.'; end if;
      if coalesce((item->>'active')::boolean,true) then total := total+bps; end if;
    else
      if coalesce(item->>'quantityPerAnimal','') !~ '^\d+$' then raise exception 'Quantidade por animal deve ser inteira.'; end if;
      qty := (item->>'quantityPerAnimal')::numeric;
      if qty<1 or qty>1000 then raise exception 'Use de 1 a 1.000 unidades por animal.'; end if;
    end if;
    parts := parts || jsonb_build_array(jsonb_build_object(
      'id',product->>'id','productId',product->>'id','name',product->>'name',
      'unit',case when symbol='KG' then 'KG' else 'UN' end,
      'percentBps',bps,'quantityPerAnimal',qty,'active',coalesce((item->>'active')::boolean,true)));
  end loop;
  if total>10000 then raise exception 'A soma dos rendimentos em KG não pode ultrapassar 100%%.'; end if;
  if jsonb_array_length(parts)<>(select count(distinct p->>'productId') from jsonb_array_elements(parts) p) then
    raise exception 'Há produtos repetidos na composição.';
  end if;
  if coalesce((old->>'current')::boolean,false) and not exists(select 1 from jsonb_array_elements(parts) p where (p->>'active')::boolean) then
    raise exception 'O modelo atual precisa de pelo menos um produto ativo.';
  end if;
  return jsonb_build_object('id',input->>'id','schemaVersion',2,'name',trim(input->>'name'),
    'species',species,'sex',sex,'category',label||' · '||case sex when 'male' then 'Macho' else 'Fêmea' end,
    'parts',parts,'totalBps',total,'familyId',coalesce(old->>'familyId',input->>'id'),
    'version',coalesce((old->>'version')::integer,0)+1,
    'active',coalesce((old->>'active')::boolean,true),'current',coalesce((old->>'current')::boolean,false));
end $$;
revoke all on function sp_private.validate_animal_model(uuid,jsonb,jsonb) from public,anon,authenticated;

-- Dispatch before legacy required fields; preserve all unrelated validators byte-for-byte.
do $$
declare src text; marker text := 'perform sp_private.require_access(company,resource,true);';
begin
  src := pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure);
  if position(marker in src)=0 then raise exception 'Unexpected validator source'; end if;
  src := replace(src,marker,marker||$patch$
  if resource='butcher_models' and (input ? 'species' or old->>'schemaVersion'='2') then
    return sp_private.validate_animal_model(company,input,old);
  end if;
$patch$);
  execute src;
  src := pg_get_functiondef('sp_private.persist_record(uuid,text,jsonb,bigint)'::regprocedure);
  if position('(old->>''totalBps'')::numeric<=0' in src)=0 then raise exception 'Unexpected model activation source'; end if;
  src := replace(src,'(old->>''totalBps'')::numeric<=0',
    'not exists(select 1 from jsonb_array_elements(old->''parts'') p where coalesce((p->>''active'')::boolean,true))');
  -- All model writes for a company share a lock, including selecting the current model.
  src := replace(src,marker,marker||$patch$
  if resource='butcher_models' then perform pg_advisory_xact_lock(hashtextextended(company::text||'butcher_models',0)); end if;
$patch$);
  execute src;
end $$;

create function sp_private.animal_model_estimate(company uuid,input jsonb,model jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  weight numeric:=0; animal jsonb; animals jsonb:='[]'; rows jsonb:='[]'; allocations jsonb;
  row jsonb; part jsonb; grams numeric:=0; animal_count integer; counted numeric; default_qty numeric;
  mode text:=coalesce(input->>'weightMode','total'); received text:=coalesce(input->>'receivedDate',current_date::text);
begin
  perform sp_private.require_access(company,'butcher_receipts');
  if input ? 'expectedModelVersion' and (input->>'expectedModelVersion')::bigint is distinct from (model->>'_version')::bigint then
    raise exception 'Modelo alterado. Refaça a estimativa antes de salvar.' using errcode='40001';
  end if;
  if not sp_private.valid_date(received) then raise exception 'Data de recebimento inválida.'; end if;
  if coalesce(input->>'animalCount','1') !~ '^\d+$' then raise exception 'Quantidade de animais deve ser inteira.'; end if;
  animal_count:=coalesce(input->>'animalCount','1')::integer;
  if animal_count<1 or animal_count>1000 then raise exception 'Use entre 1 e 1.000 animais.'; end if;
  if mode='individual' then
    if jsonb_array_length(coalesce(input->'animals','[]'))<>animal_count then raise exception 'A quantidade deve corresponder aos pesos individuais.'; end if;
    for animal in select value from jsonb_array_elements(input->'animals') loop
      grams:=sp_private.decimal_scaled(animal->>'weight',3,'Peso do animal');
      weight:=weight+grams;
      animals:=animals||jsonb_build_array(jsonb_build_object('identification',left(coalesce(animal->>'identification',''),80),'weightGrams',grams));
    end loop;
  elsif mode='total' then weight:=sp_private.decimal_scaled(input->>'weight',3,'Peso do lote');
  else raise exception 'Modo de pesagem inválido.'; end if;
  if weight>100000000 then raise exception 'Peso total máximo de 100.000 kg.'; end if;
  with parts as (
    select p,ord::integer idx,(p->>'percentBps')::numeric bps
    from jsonb_array_elements(model->'parts') with ordinality a(p,ord)
    where (p->>'active')::boolean and p->>'unit'='KG'
    union all select null,10001,10000-(model->>'totalBps')::numeric
  ), raw as (
    select *,floor(weight*bps/10000) base,mod(weight*bps,10000) rem from parts
  ), ranked as (
    select *,row_number() over(order by rem desc,idx) rank,weight-sum(base) over() rest from raw
  ) select jsonb_agg(jsonb_build_object('part',p,'grams',base+case when rank<=rest then 1 else 0 end) order by idx)
    into allocations from ranked;
  for row in select value from jsonb_array_elements(allocations) loop
    if row->'part'='null'::jsonb then grams:=(row->>'grams')::numeric;
    else rows:=rows||jsonb_build_array((row->'part')||jsonb_build_object('estimatedGrams',(row->>'grams')::numeric,'quantity',null)); end if;
  end loop;
  for part in select value from jsonb_array_elements(model->'parts') where (value->>'active')::boolean and value->>'unit'='UN' loop
    default_qty:=(part->>'quantityPerAnimal')::numeric*animal_count;
    counted:=default_qty;
    if coalesce(input#>>array['quantities',part->>'id'],'')<>'' then
      if input#>>array['quantities',part->>'id'] !~ '^\d+$' then raise exception 'Quantidade da parte deve ser inteira.'; end if;
      counted:=(input#>>array['quantities',part->>'id'])::numeric;
      if counted>1000000 then raise exception 'Quantidade fora do limite.'; end if;
    end if;
    rows:=rows||jsonb_build_array(part||jsonb_build_object('estimatedGrams',null,'quantity',counted,
      'expectedQuantity',default_qty,'quantitySource',case when coalesce(input#>>array['quantities',part->>'id'],'')='' then 'model' else 'manual' end));
  end loop;
  return jsonb_build_object('schemaVersion',2,'species',model->>'species','sex',model->>'sex',
    'animalCount',animal_count,'weightMode',mode,'animals',animals,'receivedDate',received,
    'category',model->>'category','modelId',model->>'id','modelName',model->>'name','modelVersion',model->'version',
    'modelRecordVersion',model->'_version','weightGrams',weight,'totalBps',model->'totalBps','rows',rows,
    'unallocatedGrams',grams,'reference',left(coalesce(input->>'reference',''),80));
end $$;
revoke all on function sp_private.animal_model_estimate(uuid,jsonb,jsonb) from public,anon,authenticated;

do $$
declare src text; marker text := 'if model is null then';
begin
  src:=pg_get_functiondef('sp_private.butcher_estimate(uuid,jsonb)'::regprocedure);
  if position(marker in src)=0 then raise exception 'Unexpected estimate source'; end if;
  src:=replace(src,'''id'',id) into model','''id'',id,''_version'',version) into model');
  src:=replace(src,marker,$patch$
  if model->>'schemaVersion'='2' then return sp_private.animal_model_estimate(company,input,model); end if;
$patch$||marker);
  execute src;
end $$;

-- Product references cannot be deleted while used by an animal model.
do $$
declare src text; marker text := 'perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);';
begin
  src:=pg_get_functiondef('sp_private.delete_record(uuid,text,text,bigint)'::regprocedure);
  if position(marker in src)=0 then raise exception 'Unexpected delete source'; end if;
  src:=replace(src,marker,marker||$patch$
  if resource='products' and exists(select 1 from public.butcher_models m,
    jsonb_array_elements(m.data->'parts') p where m.company_id=company and p->>'productId'=key) then
    raise exception 'Produto vinculado a um modelo de açougue.';
  end if;
$patch$);
  execute src;
end $$;
notify pgrst,'reload schema';

-- Requested generic cuts, distinct from branded/packaged items. No prices or yield defaults.
do $seed$
declare company uuid; actor uuid; item jsonb; previous_sub text; existing_count integer;
begin
  select count(*) into existing_count from public.companies where name='Supermercado do Povo';
  if existing_count=0 then return; end if;
  if existing_count<>1 then raise exception 'Empresa de destino ambígua.'; end if;
  select id into company from public.companies where name='Supermercado do Povo';
  select user_id into actor from public.memberships where company_id=company and role='owner' and active order by created_at limit 1;
  if actor is null then raise exception 'Proprietário ativo não encontrado.'; end if;
  previous_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if not exists(select 1 from public.product_categories where company_id=company and data->>'name'='Açougue') then
    perform sp_private.persist_record(company,'product_categories',jsonb_build_object('name','Açougue'),null);
  end if;
  for item in select value from jsonb_array_elements($products$[{"name": "CARNE BOV. PICANHA KG", "unit": "KG"}, {"name": "CARNE BOV. COXÃO MOLE KG", "unit": "KG"}, {"name": "CARNE BOV. COXÃO DURO KG", "unit": "KG"}, {"name": "CARNE BOV. PATINHO KG", "unit": "KG"}, {"name": "CARNE BOV. ALCATRA KG", "unit": "KG"}, {"name": "CARNE BOV. MAMINHA KG", "unit": "KG"}, {"name": "CARNE BOV. CONTRAFILÉ KG", "unit": "KG"}, {"name": "CARNE BOV. FILÉ MIGNON KG", "unit": "KG"}, {"name": "CARNE BOV. LAGARTO KG", "unit": "KG"}, {"name": "CARNE BOV. FRALDINHA KG", "unit": "KG"}, {"name": "CARNE BOV. ACÉM KG", "unit": "KG"}, {"name": "CARNE BOV. PALETA KG", "unit": "KG"}, {"name": "CARNE BOV. PEITO KG", "unit": "KG"}, {"name": "CARNE BOV. MÚSCULO KG", "unit": "KG"}, {"name": "CARNE BOV. COSTELA KG", "unit": "KG"}, {"name": "CARNE BOV. CUPIM KG", "unit": "KG"}, {"name": "CARNE BOV. PESCOÇO KG", "unit": "KG"}, {"name": "MIÚDO BOV. FÍGADO KG", "unit": "KG"}, {"name": "MIÚDO BOV. CORAÇÃO KG", "unit": "KG"}, {"name": "MIÚDO BOV. LÍNGUA KG", "unit": "KG"}, {"name": "MIÚDO BOV. RIM KG", "unit": "KG"}, {"name": "MIÚDO BOV. BUCHO KG", "unit": "KG"}, {"name": "MOCOTÓ BOV. UND", "unit": "UN"}, {"name": "CARNE SUÍNA PERNIL KG", "unit": "KG"}, {"name": "CARNE SUÍNA PALETA KG", "unit": "KG"}, {"name": "CARNE SUÍNA LOMBO KG", "unit": "KG"}, {"name": "CARNE SUÍNA COPA LOMBO KG", "unit": "KG"}, {"name": "CARNE SUÍNA COSTELA KG", "unit": "KG"}, {"name": "CARNE SUÍNA BARRIGA KG", "unit": "KG"}, {"name": "CARNE SUÍNA CARRÉ KG", "unit": "KG"}, {"name": "CARNE CAPRINA PERNIL KG", "unit": "KG"}, {"name": "CARNE CAPRINA PALETA KG", "unit": "KG"}, {"name": "CARNE CAPRINA LOMBO KG", "unit": "KG"}, {"name": "CARNE CAPRINA COSTELA KG", "unit": "KG"}, {"name": "CARNE CAPRINA PESCOÇO KG", "unit": "KG"}, {"name": "CARNE OVINA PERNIL KG", "unit": "KG"}, {"name": "CARNE OVINA PALETA KG", "unit": "KG"}, {"name": "CARNE OVINA LOMBO KG", "unit": "KG"}, {"name": "CARNE OVINA COSTELA KG", "unit": "KG"}, {"name": "CARNE OVINA PESCOÇO KG", "unit": "KG"}, {"name": "FRANGO PEITO KG", "unit": "KG"}, {"name": "FRANGO COXA KG", "unit": "KG"}, {"name": "FRANGO SOBRECOXA KG", "unit": "KG"}, {"name": "FRANGO ASA KG", "unit": "KG"}, {"name": "FRANGO DORSO KG", "unit": "KG"}, {"name": "FRANGO PESCOÇO KG", "unit": "KG"}, {"name": "FRANGO FÍGADO KG", "unit": "KG"}, {"name": "FRANGO CORAÇÃO KG", "unit": "KG"}, {"name": "FRANGO MOELA KG", "unit": "KG"}]$products$::jsonb) loop
    if not exists(select 1 from public.products where company_id=company and lower(trim(data->>'name'))=lower(item->>'name') and data->>'unit'=item->>'unit') then
      perform sp_private.persist_record(company,'products',item||jsonb_build_object('category','Açougue','photos','[]'::jsonb),null);
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $seed$;
