-- Normalize catalog names on the server, preserving identifiers, media and history.
create function sp_private.uppercase_catalog_record(resource text, document jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare field text; fields text[];
begin
  fields := case resource
    when 'products' then array['name','category','subcategory']
    when 'product_categories' then array['name']
    else array[]::text[] end;
  foreach field in array fields loop
    if jsonb_typeof(document->field)='string' then
      document := jsonb_set(document,array[field],to_jsonb(upper(trim(document->>field))));
    end if;
  end loop;
  return document;
end $$;
revoke all on function sp_private.uppercase_catalog_record(text,jsonb) from public,anon,authenticated;

-- Normalize before length/reference validation and again after canonical labels are resolved.
do $$
declare src text; marker text := 'input:=input-''_version''-''computed''-''action'';';
begin
  src := pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure);
  if position(marker in src)=0 or position('return input;' in src)=0 then
    raise exception 'Unexpected catalog validation source';
  end if;
  src := replace(src,marker,marker||E'\n input:=sp_private.uppercase_catalog_record(resource,input);');
  src := replace(src,'return input;','return sp_private.uppercase_catalog_record(resource,input);');
  execute src;
end $$;

-- Direct maintenance/seed writes obey the same representation; application writes stay RPC-only.
create function sp_private.uppercase_catalog_trigger() returns trigger
language plpgsql set search_path='' as $$
begin
  new.data := sp_private.uppercase_catalog_record(tg_table_name,new.data);
  return new;
end $$;
revoke all on function sp_private.uppercase_catalog_trigger() from public,anon,authenticated;
create trigger uppercase_catalog_names before insert or update of data on public.products
for each row execute function sp_private.uppercase_catalog_trigger();
create trigger uppercase_catalog_names before insert or update of data on public.product_categories
for each row execute function sp_private.uppercase_catalog_trigger();

-- Explicit repair of this supermarket's catalog; no operational snapshots are rewritten.
do $repair$
declare company uuid; actor uuid; previous_sub text; parent_key text; sub_key text;
  target record; row_record record; normalized jsonb; saved jsonb; count_company integer;
begin
  select count(*) into count_company from public.companies where name='Supermercado do Povo';
  if count_company=0 then return; end if;
  if count_company<>1 then raise exception 'Empresa de destino ambígua.'; end if;
  select id into company from public.companies where name='Supermercado do Povo';
  select user_id into actor from public.memberships
    where company_id=company and role='owner' and active order by created_at limit 1;
  if actor is null then raise exception 'Proprietário ativo não encontrado.'; end if;
  previous_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  for row_record in select * from public.product_categories where company_id=company for update loop
    normalized:=sp_private.uppercase_catalog_record('product_categories',row_record.data);
    if normalized is distinct from row_record.data then
      perform sp_private.persist_record(company,'product_categories',normalized||jsonb_build_object('id',row_record.id),row_record.version);
    end if;
  end loop;
  for row_record in select * from public.products where company_id=company for update loop
    normalized:=sp_private.uppercase_catalog_record('products',row_record.data);
    if normalized is distinct from row_record.data then
      perform sp_private.persist_record(company,'products',normalized||jsonb_build_object('id',row_record.id),row_record.version);
    end if;
  end loop;
  select id into parent_key from public.product_categories where company_id=company
    and data->>'name'='AÇOUGUE' and nullif(data->>'parentId','') is null;
  if parent_key is null then raise exception 'Categoria Açougue não encontrada.'; end if;
  for target in select * from (values
    ('CARNES BOVINAS',array['CARNE BOV. PICANHA KG','CARNE BOV. COXÃO MOLE KG','CARNE BOV. COXÃO DURO KG','CARNE BOV. PATINHO KG','CARNE BOV. ALCATRA KG','CARNE BOV. MAMINHA KG','CARNE BOV. CONTRAFILÉ KG','CARNE BOV. FILÉ MIGNON KG','CARNE BOV. LAGARTO KG','CARNE BOV. FRALDINHA KG','CARNE BOV. ACÉM KG','CARNE BOV. PALETA KG','CARNE BOV. PEITO KG','CARNE BOV. MÚSCULO KG','CARNE BOV. COSTELA KG','CARNE BOV. CUPIM KG','CARNE BOV. PESCOÇO KG']),
    ('MIÚDOS BOVINOS',array['MIÚDO BOV. FÍGADO KG','MIÚDO BOV. CORAÇÃO KG','MIÚDO BOV. LÍNGUA KG','MIÚDO BOV. RIM KG','MIÚDO BOV. BUCHO KG','MOCOTÓ BOV. UND']),
    ('CARNES SUÍNAS',array['CARNE SUÍNA PERNIL KG','CARNE SUÍNA PALETA KG','CARNE SUÍNA LOMBO KG','CARNE SUÍNA COPA LOMBO KG','CARNE SUÍNA COSTELA KG','CARNE SUÍNA BARRIGA KG','CARNE SUÍNA CARRÉ KG']),
    ('CARNES CAPRINAS',array['CARNE CAPRINA PERNIL KG','CARNE CAPRINA PALETA KG','CARNE CAPRINA LOMBO KG','CARNE CAPRINA COSTELA KG','CARNE CAPRINA PESCOÇO KG']),
    ('CARNES OVINAS',array['CARNE OVINA PERNIL KG','CARNE OVINA PALETA KG','CARNE OVINA LOMBO KG','CARNE OVINA COSTELA KG','CARNE OVINA PESCOÇO KG']),
    ('FRANGOS E AVES',array['FRANGO PEITO KG','FRANGO COXA KG','FRANGO SOBRECOXA KG','FRANGO ASA KG','FRANGO DORSO KG','FRANGO PESCOÇO KG','FRANGO FÍGADO KG','FRANGO CORAÇÃO KG','FRANGO MOELA KG'])
  ) as mapping(label,names) loop
    select id into sub_key from public.product_categories where company_id=company
      and data->>'parentId'=parent_key and data->>'name'=target.label;
    if sub_key is null then
      saved:=sp_private.persist_record(company,'product_categories',
        jsonb_build_object('name',target.label,'parentId',parent_key),null);
      sub_key:=saved->>'id';
    end if;
    for row_record in select * from public.products where company_id=company
      and data->>'category'='AÇOUGUE' and data->>'name'=any(target.names)
      and nullif(data->>'subcategoryId','') is null for update loop
      perform sp_private.persist_record(company,'products',row_record.data||
        jsonb_build_object('id',row_record.id,'subcategoryId',sub_key),row_record.version);
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $repair$;
