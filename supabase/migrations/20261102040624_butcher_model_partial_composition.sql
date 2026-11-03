-- Incomplete compositions are persistent drafts, never usable as current receipt models.
create or replace function sp_private.validate_animal_model_composition(company uuid, input jsonb, old jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  species text := input->>'species'; sex text := input->>'sex'; label text;
  item jsonb; product jsonb; unit jsonb; symbol text; parts jsonb := '[]';
  bps numeric; qty numeric; total numeric := 0; ready boolean;
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
      bps := case when coalesce(trim(item->>'percent'),'') ~ '^(0+([.,]0*)?)?$' then null else sp_private.decimal_scaled(item->>'percent',2,'Rendimento') end;
      if bps<=0 or bps>10000 then raise exception 'Informe um rendimento maior que zero e até 100%%.'; end if;
      if coalesce((item->>'active')::boolean,true) then total := total+coalesce(bps,0); end if;
    else
      if coalesce(trim(item->>'quantityPerAnimal'),'') ~ '^0*$' then qty:=null;
      else
      if coalesce(item->>'quantityPerAnimal','') !~ '^\d+$' then raise exception 'Quantidade por animal deve ser inteira.'; end if;
      qty := (item->>'quantityPerAnimal')::numeric;
      if qty<1 or qty>1000 then raise exception 'Use de 1 a 1.000 unidades por animal.'; end if;
      end if;
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
  ready:=exists(select 1 from jsonb_array_elements(parts) p where (p->>'active')::boolean)
    and not exists(select 1 from jsonb_array_elements(parts) p where (p->>'active')::boolean
      and (case when p->>'unit'='KG' then coalesce((p->>'percentBps')::numeric,0)<=0
        else coalesce((p->>'quantityPerAnimal')::numeric,0)<=0 end));
  return jsonb_build_object('id',input->>'id','schemaVersion',2,'name',trim(input->>'name'),
    'species',species,'sex',sex,'category',label||' · '||case sex when 'male' then 'Macho' else 'Fêmea' end,
    'parts',parts,'totalBps',total,'familyId',coalesce(old->>'familyId',input->>'id'),
    'version',coalesce((old->>'version')::integer,0)+1,
    'ready',ready,'active',coalesce((old->>'active')::boolean,true),'current',coalesce((old->>'current')::boolean,false) and ready);
end $$;

do $$
declare src text; marker text;
begin
  src:=pg_get_functiondef('sp_private.model_weighing(uuid,jsonb)'::regprocedure);
  marker:='total_weight:=sp_private.decimal_scaled(input->>''totalWeight'',3,''Peso total'');';
  if position(marker in src)=0 then raise exception 'Unexpected weighing calculator'; end if;
  src:=replace(src,marker,'total_weight:=case when coalesce(trim(input->>''totalWeight''),'''') ~ ''^(0+([.,]0*)?)?$'' then null else sp_private.decimal_scaled(input->>''totalWeight'',3,''Peso total'') end;');
  src:=replace(src,'if nullif(trim(item->>''weight''),'''') is not null then',
    'if coalesce(trim(item->>''weight''),'''') !~ ''^(0+([.,]0*)?)?$'' then');
  src:=replace(src,'''complete'',complete','''complete'',complete and total_weight is not null');
  execute src;

  src:=pg_get_functiondef('sp_private.validate_animal_model(uuid,jsonb,jsonb)'::regprocedure);
  marker:=$old$    if reference is null or not coalesce((reference->>'complete')::boolean,false) then
      raise exception 'Preencha o peso total e o peso de cada corte incluído antes de salvar a composição por pesagem.';
    end if;$old$;
  if position(marker in src)=0 then raise exception 'Unexpected weighing completion validation'; end if;
  src:=replace(src,marker,'');
  src:=replace(src,'coalesce(nullif(row_data->>''percent'',''''),item->>''percent'')','row_data->>''percent''');
  execute src;

  src:=pg_get_functiondef('sp_private.persist_record(uuid,text,jsonb,bigint)'::regprocedure);
  marker:='if not coalesce((old->>''active'')::boolean,true) or not exists';
  if position(marker in src)=0 then raise exception 'Unexpected model activation check'; end if;
  src:=replace(src,marker,'if not coalesce((old->>''active'')::boolean,true) or not coalesce((old->>''ready'')::boolean,true) or not exists');
  execute src;
end $$;
