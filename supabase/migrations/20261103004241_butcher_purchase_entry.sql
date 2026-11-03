-- Receiving records keep the purchased quarters and the purchase amount together.
-- Existing cut yields remain based on the entire received weight, not each quarter.
do $$
declare source text;
begin
  source := pg_get_functiondef('sp_private.butcher_estimate(uuid,jsonb)'::regprocedure);
  source := replace(source, 'FUNCTION sp_private.butcher_estimate(', 'FUNCTION sp_private.butcher_yield_estimate(');
  execute source;
end $$;
revoke all on function sp_private.butcher_yield_estimate(uuid,jsonb) from public,anon,authenticated;

create or replace function sp_private.butcher_estimate(company uuid,input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  mode text := coalesce(input->>'weightMode','total');
  prepared jsonb := input;
  sections jsonb := '[]';
  section jsonb;
  result jsonb;
  weight numeric := 0;
  grams numeric;
  quantity integer;
  animal_count integer;
  purchase numeric;
  purchase_text text;
  notes text := coalesce(input->>'notes','');
begin
  perform sp_private.require_access(company,'butcher_receipts');
  if jsonb_typeof(input) is distinct from 'object' then
    raise exception 'Recebimento inválido.';
  end if;
  if length(notes)>4000 then raise exception 'Use até 4.000 caracteres nas anotações.'; end if;
  if input ? 'purchaseTotal' then
    purchase_text := regexp_replace(regexp_replace(trim(coalesce(input->>'purchaseTotal','')),
      '^R\$[[:space:]]*','','i'),'[[:space:]]','','g');
    if strpos(purchase_text,',')>0 then
      if purchase_text !~ '^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$' then
        raise exception 'Valor total: informe reais com até duas casas decimais.';
      end if;
      purchase_text := replace(replace(purchase_text,'.',''),',','.');
    elsif purchase_text ~ '^\d{1,3}(\.\d{3})+$' then
      purchase_text := replace(purchase_text,'.','');
    end if;
    purchase := sp_private.decimal_scaled(purchase_text,2,'Valor total da compra');
  end if;
  if mode='parts' then
    if purchase is null then raise exception 'Informe o valor total da compra.'; end if;
    if jsonb_typeof(input->'sections') is distinct from 'array'
      or jsonb_array_length(input->'sections') not between 1 and 4000 then
      raise exception 'Informe os dianteiros e traseiros recebidos.';
    end if;
    if coalesce(input->>'animalCount','1') !~ '^\d{1,4}$' then
      raise exception 'Quantidade de animais deve ser inteira.';
    end if;
    animal_count := coalesce(input->>'animalCount','1')::integer;
    if animal_count not between 1 and 1000 then raise exception 'Use entre 1 e 1.000 animais.'; end if;
    for section in select value from jsonb_array_elements(input->'sections') loop
      if jsonb_typeof(section) is distinct from 'object'
        or coalesce(section->>'type','') not in ('forequarter','hindquarter')
        or coalesce(section->>'side','') not in ('left','right') then
        raise exception 'Selecione dianteiro ou traseiro e o lado esquerdo ou direito.';
      end if;
      if coalesce(section->>'quantity','') !~ '^\d{1,4}$' then
        raise exception 'Quantidade da parte deve ser inteira.';
      end if;
      quantity := (section->>'quantity')::integer;
      if quantity not between 1 and 1000 then raise exception 'Use de 1 a 1.000 partes por linha.'; end if;
      grams := sp_private.decimal_scaled(section->>'weight',3,'Peso total da linha');
      weight := weight+grams;
      sections := sections || jsonb_build_array(jsonb_build_object('type',section->>'type',
        'side',section->>'side','quantity',quantity,'weightGrams',grams));
    end loop;
    if weight>100000000 then raise exception 'Peso total máximo de 100.000 kg.'; end if;
    if exists (
      select 1 from (values ('forequarter','left'),('forequarter','right'),
        ('hindquarter','left'),('hindquarter','right')) expected(type,side)
      where (select coalesce(sum((s->>'quantity')::integer),0) from jsonb_array_elements(sections) s
        where s->>'type'=expected.type and s->>'side'=expected.side) <> animal_count
    ) then
      raise exception 'Para usar o modelo do animal inteiro, informe os quatro quartos de cada animal.';
    end if;
    prepared := input || jsonb_build_object('weightMode','total','weight',(weight/1000)::text);
  end if;
  result := sp_private.butcher_yield_estimate(company,prepared);
  if mode='parts' and result->>'species' is distinct from 'bovine' then
    raise exception 'A pesagem por dianteiros e traseiros exige um modelo bovino.';
  end if;
  weight := (result->>'weightGrams')::numeric;
  if mode='parts' then
    with raw as (
      select s,position,floor(purchase*(s->>'weightGrams')::numeric/weight) base,
        mod(purchase*(s->>'weightGrams')::numeric,weight) remainder
      from jsonb_array_elements(sections) with ordinality items(s,position)
    ), ranked as (
      select *,row_number() over(order by remainder desc,position) rank,
        purchase-sum(base) over() remaining from raw
    )
    select jsonb_agg(s || jsonb_build_object('allocatedCostCents',
      base+case when rank<=remaining then 1 else 0 end) order by position) into sections from ranked;
  end if;
  return result || jsonb_build_object('weightMode',mode,'sections',sections,'notes',notes,
    'purchaseTotalCents',purchase,
    'purchaseCostPerKgCents',case when purchase is not null then round(purchase*1000/weight) end,
    'purchaseAllocationBasis','received_weight','yieldBasis','received_total');
end $$;
revoke all on function sp_private.butcher_estimate(uuid,jsonb) from public,anon,authenticated;

-- Operational lists include the purchase summary without reading full receipt rows.
do $$
declare source text; marker text := '''modelVersion'',''totalBps'']';
begin
  if to_regprocedure('sp_private.resource_summary(text,jsonb)') is not null then
    source := pg_get_functiondef('sp_private.resource_summary(text,jsonb)'::regprocedure);
    if position(marker in source)=0 then raise exception 'Unexpected operational receipt summary'; end if;
    source := replace(source,marker,
      '''modelVersion'',''totalBps'',''weightMode'',''purchaseTotalCents'',''purchaseCostPerKgCents'']');
    execute source;
  end if;
end $$;
notify pgrst,'reload schema';
