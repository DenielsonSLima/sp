-- A promotion owns its header and poster items atomically. Legacy single posters remain valid.
create function sp_private.validate_price_promotion(company uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; clean jsonb; items jsonb := '[]'; seen text[] := array[]::text[];
begin
  perform sp_private.require_access(company,'price_tables',true);
  if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>26214400
    or input->>'kind' is distinct from 'promotion' then raise exception 'Promoção inválida.'; end if;
  if length(trim(coalesce(input->>'name',''))) not between 1 and 120
    or length(coalesce(input->>'notes',''))>4000 then raise exception 'Informe o nome da promoção e observação de até 4.000 caracteres.'; end if;
  if not sp_private.valid_date(input->>'start') or not sp_private.valid_date(input->>'end')
    or input->>'start'>input->>'end' then raise exception 'Informe a data inicial e final válidas da promoção.'; end if;
  if coalesce(input->>'status','') not in ('draft','sent','finalized')
    or jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items')>100 then
    raise exception 'Etapa ou produtos da promoção inválidos; use até 100 produtos.';
  end if;
  if input->>'status'<>'draft' and jsonb_array_length(input->'items')=0 then
    raise exception 'Adicione produtos à promoção antes de enviar.';
  end if;
  for item in select value from jsonb_array_elements(input->'items') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')=''
      or coalesce(item->>'productId','')='' or (item->>'productId')=any(seen)
      or (item->>'id') in (select v->>'id' from jsonb_array_elements(items) v) then
      raise exception 'Produtos repetidos ou inválidos na promoção.';
    end if;
    if coalesce(item->>'quantity','') !~ '^\d{1,3}$' or (item->>'quantity')::integer not between 1 and 200
      or coalesce(item->>'printLayout','') not in ('individual','two-a4') then
      raise exception 'Use quantidade de 1 a 200 cartazes e formato válido.';
    end if;
    -- Reuse the canonical poster validator, including BRL cents and sent snapshot rules.
    clean := sp_private.validate_record(company,'price_tables',
      (item-'kind'-'items')||jsonb_build_object('status',input->>'status','start',input->>'start','end',input->>'end'));
    items := items||jsonb_build_array(clean-'status'-'start'-'end');
    seen := array_append(seen,item->>'productId');
  end loop;
  return (input-'_version'-'computed'-'action')||jsonb_build_object('name',trim(input->>'name'),'items',items);
end $$;
revoke all on function sp_private.validate_price_promotion(uuid,jsonb) from public,anon,authenticated;

create function sp_private.price_promotion_command(company uuid,action text,key text,payload jsonb,expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc jsonb; version bigint; item jsonb; items jsonb; cat jsonb; model jsonb; patch jsonb;
  product_key text; item_key text; stamp text := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  perform sp_private.require_access(company,'price_tables',true);
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Operação inválida.'; end if;
  if action='createPromotion' then
    if key is not null or expected is not null then raise exception 'Criação não aceita registro existente.'; end if;
    doc := jsonb_build_object('id',gen_random_uuid()::text,'kind','promotion','status','draft',
      'name',payload->>'name','start',payload->>'start','end',payload->>'end','notes',coalesce(payload->>'notes',''),
      'items','[]'::jsonb,'createdAt',stamp,'updatedAt',stamp,'archivedAt',null,'finalizedAt',null);
    return sp_private.persist_record(company,'price_tables',doc,null);
  end if;
  if key is null then raise exception 'Selecione uma promoção.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||'price_tables'||key,0));
  select data||jsonb_build_object('id',id),p.version into doc,version from public.price_tables p
    where company_id=company and id=key for update;
  if doc is null then raise exception 'Registro não encontrado.'; end if;
  if expected is distinct from version then
    raise exception 'Registro alterado por outra sessão. Recarregue antes de continuar.' using errcode='40001';
  end if;
  if doc->>'status' is distinct from 'draft' or doc->>'archivedAt' is not null then
    raise exception 'Altere ou exclua somente rascunhos abertos.';
  end if;
  if action='deletePromotion' then
    delete from public.price_tables where company_id=company and id=key;
    insert into public.audit_log(company_id,actor_id,resource,record_id,action,version)
      values(company,auth.uid(),'price_tables',key,'delete',version);
    return jsonb_build_object('deleted',true);
  end if;
  if doc->>'kind' is distinct from 'promotion' then raise exception 'Este registro é um cartaz individual.'; end if;
  if action='updatePromotion' then
    doc := doc||jsonb_build_object('name',payload->>'name','start',payload->>'start','end',payload->>'end',
      'notes',coalesce(payload->>'notes',''));
  elsif action='addProducts' then
    if jsonb_typeof(payload->'productIds') is distinct from 'array'
      or jsonb_array_length(payload->'productIds') not between 1 and 100 then
      raise exception 'Selecione de 1 a 100 produtos.';
    end if;
    items := doc->'items';
    for product_key in select jsonb_array_elements_text(payload->'productIds') loop
      if exists(select 1 from jsonb_array_elements(items) v where v->>'productId'=product_key) then
        raise exception 'Um dos produtos já está na promoção.';
      end if;
      cat := sp_private.catalog(company,'products',product_key);
      -- Preserve metadata and the primary photo only; a bulk promotion never copies all gallery pixels.
      cat := (cat-array['photos','photo','image','photoAssets'])||sp_private.product_photo_snapshot(cat);
      item := jsonb_build_object('id',gen_random_uuid()::text,'productId',cat->>'id','productSnapshot',cat,
        'name',cat->>'name','code',coalesce(cat->>'code',''),'unit',case when cat->>'unit'='KG' or cat->>'unitLabel' like 'KG%' then 'kg' else 'unid' end,
        'priceRaw','','quantity',1,'templateId','','templateSnapshot',null,'printLayout','individual');
      items := items||jsonb_build_array(item);
    end loop;
    doc := doc||jsonb_build_object('items',items);
  elsif action='updateProduct' then
    item_key := payload->>'itemId'; patch := payload->'input';
    if jsonb_typeof(patch) is distinct from 'object' or not exists(
      select 1 from jsonb_array_elements(doc->'items') v where v->>'id'=item_key) then
      raise exception 'Produto da promoção não encontrado.';
    end if;
    select coalesce(jsonb_object_agg(k,v),'{}') into patch from jsonb_each(patch) e(k,v)
      where k=any(array['priceRaw','templateId','quantity','printLayout']);
    if patch ? 'templateId' then
      model := null;
      if coalesce(patch->>'templateId','')<>'' then model := sp_private.catalog(company,'poster_templates',patch->>'templateId'); end if;
      patch := patch||jsonb_build_object('templateSnapshot',model);
    end if;
    select jsonb_agg(case when v->>'id'=item_key then v||patch else v end order by n) into items
      from jsonb_array_elements(doc->'items') with ordinality e(v,n);
    doc := doc||jsonb_build_object('items',items);
  elsif action='removeProducts' then
    if jsonb_typeof(payload->'itemIds') is distinct from 'array' or jsonb_array_length(payload->'itemIds') not between 1 and 100
      or exists(select 1 from jsonb_array_elements_text(payload->'itemIds') k where not exists(
        select 1 from jsonb_array_elements(doc->'items') v where v->>'id'=k)) then
      raise exception 'Selecione produtos válidos da promoção.';
    end if;
    select coalesce(jsonb_agg(v order by n),'[]') into items
      from jsonb_array_elements(doc->'items') with ordinality e(v,n) where not (payload->'itemIds') ? (v->>'id');
    doc := doc||jsonb_build_object('items',items);
  else raise exception 'Operação de promoção inválida.';
  end if;
  return sp_private.persist_record(company,'price_tables',doc||jsonb_build_object('updatedAt',stamp),version);
end $$;
revoke all on function sp_private.price_promotion_command(uuid,text,text,jsonb,bigint) from public,anon,authenticated;

-- Narrow dispatches preserve every unrelated resource and existing single-poster transition.
do $patch$
declare definition text; anchor text; replacement text;
begin
  definition := pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure);
  anchor := 'perform sp_private.require_access(company,resource,true);';
  if position('validate_price_promotion' in definition)>0 or position(anchor in definition)=0 then raise exception 'Unexpected validator version'; end if;
  execute replace(definition,anchor,anchor||E'\n if resource=''price_tables'' and input->>''kind''=''promotion'' then return sp_private.validate_price_promotion(company,input); end if;');
  definition := pg_get_functiondef('sp_private.command(uuid,text,text,text,jsonb,bigint)'::regprocedure);
  anchor := 'perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);';
  if position(anchor in definition)=0 then raise exception 'Unexpected command version'; end if;
  definition := replace(definition,anchor,anchor||$dispatch$
  if resource='price_tables' and action in ('send','finalize') and key is not null then
    raise exception 'Operações em lote não aceitam um registro individual.';
  end if;
  if resource='price_tables' and action in ('createPromotion','updatePromotion','addProducts','updateProduct','removeProducts','deletePromotion') then
    return sp_private.price_promotion_command(company,action,key,payload,expected);
  end if;
$dispatch$);
  anchor := 'if action=''saveDraft'' then';
  if position(anchor in definition)=0 then raise exception 'Unexpected draft command'; end if;
  definition := replace(definition,anchor,anchor||$guard$
  if doc->>'kind'='promotion' or coalesce(payload->'input',payload)->>'kind'='promotion' then
    raise exception 'Use os comandos de promoção para manter seus produtos.';
  end if;
$guard$);
  anchor := 'perform 1 from public.price_tables where company_id=company and (payload->''keys'') ? id order by id for update;';
  if position(anchor in definition)=0 then raise exception 'Unexpected batch lock order'; end if;
  definition := replace(definition,anchor,$locks$
  -- Every writer takes advisory locks before row locks, in the same ID order.
  for recordkey in select id from public.price_tables where company_id=company and (payload->'keys') ? id order by id loop
    perform pg_advisory_xact_lock(hashtextextended(company::text||'price_tables'||recordkey,0));
  end loop;
$locks$||anchor);
  execute definition;
  definition := pg_get_functiondef('sp_private.delete_record(uuid,text,text,bigint)'::regprocedure);
  anchor := 'data->>''productId''=key';
  if position(anchor in definition)=0 then raise exception 'Unexpected product reference guard'; end if;
  execute replace(definition,anchor,'(data->>''productId''=key or exists(select 1 from jsonb_array_elements(coalesce(data->''items'',''[]'')) i where i->>''productId''=key))');
end $patch$;

-- The summary contains references and counts, never product/template image bytes.
do $patch$
declare definition text; anchor text := 'elsif resource = ''price_tables'' then';
begin
  definition := pg_get_functiondef('sp_private.resource_summary(text,jsonb)'::regprocedure);
  if position(anchor in definition)=0 then raise exception 'Unexpected summary version'; end if;
  execute replace(definition,anchor,$summary$
  elsif resource='price_tables' and source->>'kind'='promotion' then
    result := jsonb_build_object('kind','promotion','name',source->'name','notes',source->'notes',
      'status',source->'status','start',source->'start','end',source->'end','date',source->'start',
      'finalizedAt',source->'finalizedAt','archivedAt',source->'archivedAt','restoredAt',source->'restoredAt',
      'itemCount',jsonb_array_length(source->'items'),'itemNames',names,
      'productIds',(select coalesce(jsonb_agg(v->'productId' order by n),'[]')
        from jsonb_array_elements(source->'items') with ordinality e(v,n) where n<=3));
$summary$||anchor);
end $patch$;
notify pgrst,'reload schema';
