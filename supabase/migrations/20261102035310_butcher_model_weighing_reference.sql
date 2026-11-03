-- One-animal measured reference, with all percentages and totals computed in PostgreSQL.
create function sp_private.model_weighing(company uuid,input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  total_weight numeric; measured numeric:=0; item jsonb; product jsonb; unit jsonb;
  grams numeric; rows jsonb:='[]'; calculated jsonb; complete boolean:=true;
begin
  perform sp_private.require_access(company,'butcher_models');
  total_weight:=sp_private.decimal_scaled(input->>'totalWeight',3,'Peso total');
  if total_weight<=0 or total_weight>100000000 then raise exception 'Informe um peso total maior que zero e até 100.000 kg.'; end if;
  if jsonb_typeof(input->'parts') is distinct from 'array' or jsonb_array_length(input->'parts')>100 then
    raise exception 'Informe até 100 produtos para a pesagem.';
  end if;
  if jsonb_array_length(input->'parts')<>(select count(distinct p->>'productId') from jsonb_array_elements(input->'parts') p) then
    raise exception 'Há produtos repetidos na pesagem.';
  end if;
  for item in select value from jsonb_array_elements(input->'parts') loop
    product:=sp_private.catalog(company,'products',item->>'productId');
    unit:=sp_private.catalog(company,'units',product->>'unit');
    if upper(unit->>'symbol') not in ('KG','UN','UND') then raise exception 'Selecione produtos em KG ou UND.'; end if;
    if upper(unit->>'symbol')<>'KG' then continue; end if;
    grams:=null;
    if nullif(trim(item->>'weight'),'') is not null then
      grams:=sp_private.decimal_scaled(item->>'weight',3,'Peso do corte');
      if grams<=0 or grams>total_weight then raise exception 'O peso do corte deve ser maior que zero e não pode superar o peso total.'; end if;
    end if;
    if coalesce((item->>'active')::boolean,true) then
      measured:=measured+coalesce(grams,0);
      if grams is null then complete:=false; end if;
    end if;
    rows:=rows||jsonb_build_array(jsonb_build_object('productId',product->>'id','weightGrams',grams,
      'weight',case when grams is null then '' else round(grams/1000,3)::text end,
      'active',coalesce((item->>'active')::boolean,true)));
  end loop;
  if measured>total_weight then raise exception 'A soma dos pesos dos cortes não pode ultrapassar o peso total.'; end if;
  -- Largest remainders keep the rounded percent total exact, including a fully weighed animal.
  with raw as (
    select p,idx,(p->>'weightGrams')::numeric*10000/total_weight exact
    from jsonb_array_elements(rows) with ordinality a(p,idx)
  ), active_rows as (
    select idx,floor(exact) base,row_number() over(order by exact-floor(exact) desc,idx) rank,
      round(measured*10000/total_weight)-sum(floor(exact)) over() remainder
    from raw where (p->>'active')::boolean and exact is not null
  ), amounts as (
    select raw.*,case when raw.exact is null then null
      when (raw.p->>'active')::boolean then a.base+case when a.rank<=a.remainder then 1 else 0 end
      else round(raw.exact) end bps
    from raw left join active_rows a using(idx)
  ) select coalesce(jsonb_agg(p||jsonb_build_object('percentBps',bps,
      'percent',case when bps is null then '' else round(bps/100,2)::text end) order by idx),'[]') into calculated from amounts;
  return jsonb_build_object('totalWeight', round(total_weight/1000,3)::text,'totalGrams',total_weight,
    'distributedGrams',measured,'remainingGrams',total_weight-measured,
    'totalBps',round(measured*10000/total_weight),'complete',complete,'rows',calculated);
end $$;
revoke all on function sp_private.model_weighing(uuid,jsonb) from public,anon,authenticated;

-- Keep the existing composition validator as the authoritative product/quantity validator.
alter function sp_private.validate_animal_model(uuid,jsonb,jsonb) rename to validate_animal_model_composition;
create function sp_private.validate_animal_model(company uuid,input jsonb,old jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mode text:=coalesce(input->>'compositionMode',old->>'compositionMode','percent');
  reference jsonb; reference_input jsonb; item jsonb; row_data jsonb; parts jsonb:='[]'; result jsonb;
begin
  perform sp_private.require_access(company,'butcher_models',true);
  if mode not in ('percent','weight') then raise exception 'Modo de composição inválido.'; end if;
  if input ? 'weighingTotal' and (mode='weight' or nullif(trim(input->>'weighingTotal'),'') is not null) then
    reference_input:=jsonb_build_object('totalWeight',input->>'weighingTotal','parts',input->'parts');
  elsif mode='weight' then
    reference:=coalesce(input->'weighing',old->'weighing');
    for item in select value from jsonb_array_elements(input->'parts') loop
      select r into row_data from jsonb_array_elements(reference->'rows') r where r->>'productId'=item->>'productId';
      parts:=parts||jsonb_build_array(item||jsonb_build_object('weight',row_data->>'weight'));
    end loop;
    reference_input:=jsonb_build_object('totalWeight',reference->>'totalWeight','parts',parts);
  end if;
  if reference_input is not null then
    reference:=sp_private.model_weighing(company,reference_input);
    reference:=reference||jsonb_build_object('recordedAt',
      case when reference=((old->'weighing')-'recordedAt') then old#>>'{weighing,recordedAt}' else to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
  else
    reference:=old->'weighing';
  end if;
  if mode='weight' then
    if reference is null or not coalesce((reference->>'complete')::boolean,false) then
      raise exception 'Preencha o peso total e o peso de cada corte incluído antes de salvar a composição por pesagem.';
    end if;
    parts:='[]';
    for item in select value from jsonb_array_elements(input->'parts') loop
      select r into row_data from jsonb_array_elements(reference->'rows') r where r->>'productId'=item->>'productId';
      parts:=parts||jsonb_build_array(case when row_data is null then item
        else item||jsonb_build_object('percent',coalesce(nullif(row_data->>'percent',''),item->>'percent')) end);
    end loop;
    input:=input||jsonb_build_object('parts',parts);
  end if;
  result:=sp_private.validate_animal_model_composition(company,input,old);
  return result||jsonb_build_object('compositionMode',mode,'weighing',reference);
end $$;
revoke all on function sp_private.validate_animal_model(uuid,jsonb,jsonb) from public,anon,authenticated;

do $$
declare src text; marker text:='elsif kind=''butcher'' then return sp_private.butcher_estimate(company,input);';
begin
  src:=pg_get_functiondef('sp_private.calculate(uuid,text,jsonb)'::regprocedure);
  if position(marker in src)=0 then raise exception 'Unexpected calculation dispatcher'; end if;
  src:=replace(src,marker,marker||E'\n elsif kind=''butcher_model_weighing'' then return sp_private.model_weighing(company,input);');
  execute src;
end $$;
