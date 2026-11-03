-- New models are identified by species alone. Keep historical sex-specific categories
-- intact so existing current models and receipt snapshots retain their contracts.
create or replace function sp_private.validate_animal_model_composition(company uuid, input jsonb, old jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  species text := input->>'species'; sex text := coalesce(nullif(trim(input->>'sex'),''), old->>'sex'); label text;
  item jsonb; product jsonb; unit jsonb; symbol text; parts jsonb := '[]';
  bps numeric; qty numeric; total numeric := 0; ready boolean;
begin
  perform sp_private.require_access(company,'butcher_models',true);
  label := case species when 'bovine' then 'Bovino' when 'swine' then 'Suíno'
    when 'caprine' then 'Caprino' when 'ovine' then 'Ovino' when 'poultry' then 'Aves' end;
  if label is null then
    raise exception 'Selecione a espécie animal.';
  end if;
  if sex is not null and sex not in ('male','female') then
    raise exception 'Sexo inválido.';
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
    'species',species,'sex',sex,'category',case when sex is not null
      then label||' · '||case sex when 'male' then 'Macho' else 'Fêmea' end
      else label||case species when 'bovine' then ' — boi / vaca'
        when 'swine' then ' — porco / porca' when 'caprine' then ' — bode / cabra'
        when 'ovine' then ' — carneiro / ovelha' when 'poultry' then ' — galo / galinha' end end,
    'parts',parts,'totalBps',total,'familyId',coalesce(old->>'familyId',input->>'id'),
    'version',coalesce((old->>'version')::integer,0)+1,
    'ready',ready,'active',coalesce((old->>'active')::boolean,true),'current',coalesce((old->>'current')::boolean,false) and ready);
end $$;

revoke all on function sp_private.validate_animal_model_composition(uuid,jsonb,jsonb) from public,anon,authenticated;
