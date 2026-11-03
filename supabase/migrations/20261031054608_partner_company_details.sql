-- Company registration validation stays in PostgreSQL, including numeric and alphanumeric CNPJ.
create function sp_private.normalize_cnpj(value text) returns text
 language plpgsql immutable set search_path='' as $$
 declare result text:=upper(regexp_replace(coalesce(value,''),'[./[:space:]-]','','g'));part text;sum_value integer;remainder integer;digit integer;position integer;stage integer;weights integer[];begin
 if result='' then return '';end if;
 if result !~ '^[A-Z0-9]{12}[0-9]{2}$' or result=repeat(substr(result,1,1),14) then raise exception 'CNPJ inválido. Confira as 14 posições.';end if;
 part:=left(result,12);
 for stage in 1..2 loop
 weights:=case stage when 1 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;sum_value:=0;
 for position in 1..length(part) loop sum_value:=sum_value+(ascii(substr(part,position,1))-48)*weights[position];end loop;
 remainder:=sum_value%11;digit:=case when remainder<2 then 0 else 11-remainder end;
 if substr(result,12+stage,1)<>digit::text then raise exception 'CNPJ inválido. Confira os dígitos verificadores.';end if;
 part:=part||digit::text;
 end loop;return result;
 end $$;
revoke all on function sp_private.normalize_cnpj(text) from public,anon,authenticated;
create function sp_private.partner_cnpj(company uuid,value text) returns text
 language plpgsql stable security definer set search_path='' as $$declare result text;begin
 perform sp_private.require_access(company,'partners',true);result:=sp_private.normalize_cnpj(value);
 if result='' then raise exception 'Informe o CNPJ para consultar.';end if;return result;
 end $$;
create function public.sp_partner_cnpj(p_company_id uuid,p_cnpj text) returns text
 language sql stable security invoker set search_path='' as $$select sp_private.partner_cnpj(p_company_id,p_cnpj)$$;
revoke all on function sp_private.partner_cnpj(uuid,text),public.sp_partner_cnpj(uuid,text) from public,anon,authenticated;
grant execute on function sp_private.partner_cnpj(uuid,text),public.sp_partner_cnpj(uuid,text) to authenticated;
create unique index partners_company_cnpj on public.partners(company_id,(data->>'cnpj')) where coalesce(data->>'cnpj','')<>'';
create or replace function sp_private.validate_record(company uuid,resource text,input jsonb,old jsonb default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare item jsonb;previous jsonb;items jsonb:='[]';cat jsonb;unit jsonb;parts jsonb:='[]';sumval numeric:=0;amount numeric;quantity numeric;total numeric:=0;settled numeric:=0;key text;value jsonb;family text;required text[];nextversion integer;png bytea;png_width bigint;png_height bigint;parentcat jsonb;subcategory_record jsonb;begin
 perform sp_private.require_access(company,resource,true);
 if jsonb_typeof(input)<>'object' then raise exception 'Registro inválido.';end if;
 input:=input-'_version'-'computed'-'action';if octet_length(input::text)>26214400 then raise exception 'Registro excede o limite de 25 MB.';end if;
 required:=case resource
 when 'product_categories' then array['name'] when 'flyer_templates' then array['name','width','height','kind','definition','productCount'] when 'flyer_assets' then array['label','kind','src','width','height'] when 'units' then array['name','symbol'] when 'partners' then array['name','type'] when 'products' then array['name','unit']
 when 'profiles' then array['name','modules'] when 'company_settings' then array['name']
 when 'watermarks' then array['text','opacity','size','rotation','type'] when 'headers' then array['title','alignment','showLogo','showContact']
 when 'brand_assets' then array['name','category','dataURL','width','height'] when 'brand_categories' then array['name']
 when 'butcher_models' then array['name','category','parts'] when 'quotes' then array['title','date','items','providers']
 when 'hortifruti_receipts' then array['date','items'] when 'supplier_returns' then array['number','originalInvoice','reason','date','items']
 when 'campaigns' then array['name','start','end','items'] when 'price_tables' then array['status']
 when 'calendar_events' then array['title','date','type','color'] else array[]::text[] end;
 foreach key in array required loop if not input ? key or input->key='null'::jsonb then raise exception 'Campo obrigatório: %.',key;end if;end loop;

 if resource='units' then if length(trim(coalesce(input->>'name',''))) not between 1 and 60 or length(trim(coalesce(input->>'symbol',''))) not between 1 and 8 then raise exception 'Informe nome de até 60 caracteres e sigla de até 8 caracteres.';end if;input:=jsonb_build_object('id',input->>'id','name',trim(input->>'name'),'symbol',upper(trim(input->>'symbol')));
 elsif resource='partners' then
 if input->>'type' is null or input->>'type' not in ('Fornecedor','Cliente','Ambos','Outro') then raise exception 'Selecione o tipo do parceiro.';end if;
 items:='{}'::jsonb;
 value:=to_jsonb(trim(coalesce(input->>'name','')));if length(value#>>'{}')>100 then raise exception 'Campo name excede 100 caracteres.';end if;items:=items||jsonb_build_object('name',value);
 value:=to_jsonb(trim(coalesce(input->>'legalName',old->>'legalName','')));if length(value#>>'{}')>200 then raise exception 'Campo legalName excede 200 caracteres.';end if;items:=items||jsonb_build_object('legalName',value);
 value:=to_jsonb(trim(coalesce(input->>'tradeName',old->>'tradeName','')));if length(value#>>'{}')>100 then raise exception 'Campo tradeName excede 100 caracteres.';end if;items:=items||jsonb_build_object('tradeName',value);
 value:=to_jsonb(trim(coalesce(input->>'email',old->>'email','')));if length(value#>>'{}')>254 then raise exception 'Campo email excede 254 caracteres.';end if;items:=items||jsonb_build_object('email',value);
 value:=to_jsonb(trim(coalesce(input->>'phone',old->>'phone','')));if length(value#>>'{}')>40 then raise exception 'Campo phone excede 40 caracteres.';end if;items:=items||jsonb_build_object('phone',value);
 value:=to_jsonb(trim(coalesce(input->>'street',old->>'street','')));if length(value#>>'{}')>160 then raise exception 'Campo street excede 160 caracteres.';end if;items:=items||jsonb_build_object('street',value);
 value:=to_jsonb(trim(coalesce(input->>'number',old->>'number','')));if length(value#>>'{}')>30 then raise exception 'Campo number excede 30 caracteres.';end if;items:=items||jsonb_build_object('number',value);
 value:=to_jsonb(trim(coalesce(input->>'complement',old->>'complement','')));if length(value#>>'{}')>160 then raise exception 'Campo complement excede 160 caracteres.';end if;items:=items||jsonb_build_object('complement',value);
 value:=to_jsonb(trim(coalesce(input->>'district',old->>'district','')));if length(value#>>'{}')>100 then raise exception 'Campo district excede 100 caracteres.';end if;items:=items||jsonb_build_object('district',value);
 value:=to_jsonb(trim(coalesce(input->>'city',old->>'city','')));if length(value#>>'{}')>100 then raise exception 'Campo city excede 100 caracteres.';end if;items:=items||jsonb_build_object('city',value);
 value:=to_jsonb(trim(coalesce(input->>'state',old->>'state','')));if length(value#>>'{}')>2 then raise exception 'Campo state excede 2 caracteres.';end if;items:=items||jsonb_build_object('state',value);
 value:=to_jsonb(trim(coalesce(input->>'postalCode',old->>'postalCode','')));if length(value#>>'{}')>10 then raise exception 'CEP inválido.';end if;items:=items||jsonb_build_object('postalCode',value);
 if trim(items->>'name')='' then raise exception 'Informe o nome do parceiro.';end if;
 items:=items||jsonb_build_object('state',upper(items->>'state'),'postalCode',regexp_replace(items->>'postalCode','[[:space:]-]','','g'));
 if items->>'postalCode'<>'' and items->>'postalCode' !~ '^[0-9]{8}$' then raise exception 'CEP inválido. Use oito dígitos.';end if;
 if items->>'state'<>'' and not (items->>'state'=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then raise exception 'UF inválida.';end if;
 input:=items||jsonb_build_object('id',input->>'id','type',input->>'type','cnpj',sp_private.normalize_cnpj(coalesce(input->>'cnpj',old->>'cnpj','')));
 if input->>'cnpj'<>'' and exists(select 1 from public.partners where company_id=company and data->>'cnpj'=input->>'cnpj' and id<>coalesce(input->>'id','')) then raise exception 'Já existe um parceiro com esse CNPJ nesta empresa.';end if;
 elsif resource='product_categories' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 80 or input->>'name' ~ '[[:cntrl:]]' then raise exception 'Informe uma categoria com até 80 caracteres.';end if;
 if old is not null and nullif(old->>'parentId','') is distinct from nullif(input->>'parentId','') then raise exception 'O vínculo da categoria não pode ser alterado. Crie outra subcategoria.';end if;
 if nullif(input->>'parentId','') is not null then
 select data||jsonb_build_object('id',id) into parentcat from public.product_categories where company_id=company and id=input->>'parentId' and nullif(data->>'parentId','') is null;
 if parentcat is null or input->>'parentId'=input->>'id' then raise exception 'Selecione uma categoria principal desta empresa.';end if;
 end if;
 input:=jsonb_build_object('id',input->>'id','name',trim(input->>'name'),'parentId',nullif(input->>'parentId',''));
 elsif resource='flyer_assets' then
 if length(trim(coalesce(input->>'label',''))) not between 1 and 100 or input->>'kind' not in ('background','sticker') or input->>'src'<>'./assets/encartes/camadas/'||(input->>'id')||'.png' or (input->>'width')::integer not between 1 and 10000 or (input->>'height')::integer not between 1 and 10000 or (input->>'width')::bigint*(input->>'height')::bigint>20000000 then raise exception 'Recurso gráfico inválido.';end if;
 elsif resource='flyer_templates' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or input->>'kind' not in ('simple','layered') or (input->>'productCount')::integer not between 1 and 200 or (input->>'width')::numeric not between 320 and 4096 or (input->>'height')::numeric not between 320 and 4096 then raise exception 'Modelo de encarte inválido.';end if;
 if (input#>>'{definition,width}')::numeric<>(input->>'width')::numeric or (input#>>'{definition,height}')::numeric<>(input->>'height')::numeric then raise exception 'Dimensões do modelo e da definição não correspondem.';end if;
 perform sp_private.validate_record(company,'flyers',input->'definition');
 elsif resource='products' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or length(coalesce(input->>'code',''))>40 then raise exception 'Nome ou código de produto inválido.';end if;
 if not exists(select 1 from public.product_categories where company_id=company and lower(data->>'name')=lower(trim(coalesce(input->>'category',''))) and nullif(data->>'parentId','') is null) then raise exception 'Selecione uma categoria cadastrada.';end if;
 select data||jsonb_build_object('id',id) into cat from public.product_categories where company_id=company and lower(data->>'name')=lower(trim(input->>'category')) and nullif(data->>'parentId','') is null;
 input:=input||jsonb_build_object('category',cat->>'name');
 key:=coalesce(input->>'subcategoryId',old->>'subcategoryId','');
 if key<>'' then
 select data||jsonb_build_object('id',id) into subcategory_record from public.product_categories where company_id=company and id=key and data->>'parentId'=cat->>'id';
 if subcategory_record is null then raise exception 'A subcategoria deve pertencer à categoria selecionada.';end if;
 end if;
 input:=input||jsonb_build_object('subcategoryId',key,'subcategory',coalesce(subcategory_record->>'name',''));
 unit:=sp_private.catalog(company,'units',input->>'unit');
 items:=coalesce(input->'photos',case when coalesce(input->>'photo','')<>'' then jsonb_build_array(input->>'photo') else coalesce(old->'photos','[]'::jsonb) end);
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5 then raise exception 'Galeria de fotos inválida.';end if;
 input:=input||jsonb_build_object('photoAssets',sp_private.normalize_product_photo_assets(company,input->>'id',coalesce(input->'photoAssets',old->'photoAssets','[]'::jsonb),jsonb_array_length(items)));
 for item in select * from jsonb_array_elements(items) loop if length(item#>>'{}')>4200000 or item#>>'{}' !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Use imagens JPEG, PNG ou WebP de até 3 MB.';end if;end loop;
 input:=input||jsonb_build_object('name',trim(input->>'name'),'code',trim(coalesce(input->>'code','')),'category',coalesce(nullif(trim(input->>'category'),''),'Sem categoria'),'unitLabel',(unit->>'symbol')||' · '||(unit->>'name'),'photos',items,'photo',coalesce(items->>0,''),'image',coalesce(items->>0,''));
 elsif resource='profiles' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 80 or coalesce(jsonb_typeof(input->'modules'),'null')<>'array' then raise exception 'Perfil inválido.';end if;
 for item in select * from jsonb_array_elements(input->'modules') loop if item#>>'{}' not in ('inicio','cadastros','cotacao','hortifruti','acougue','devolucoes','encartes','promocoes','tabela-precos','calendario','configuracoes') then raise exception 'Módulo de perfil inválido.';end if;end loop;
 elsif resource='company_settings' then if length(trim(coalesce(input->>'name',''))) not between 1 and 120 then raise exception 'Informe o nome da empresa.';end if;
 elsif resource='watermarks' then
 if input->>'type'='image' and coalesce(input->>'image','')<>'' and (input->>'image' !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' or length(input->>'image')>4200000) then raise exception 'Imagem da marca d’água inválida.';end if;
 if input->>'type' not in ('text','image') or (input->>'opacity')::numeric not between 5 and 50 or (input->>'size')::numeric not between 18 and 56 or (input->>'rotation')::numeric not between -45 and 45 or length(coalesce(input->>'text',''))>60 then raise exception 'Configuração de marca d’água inválida.';end if;
 elsif resource='headers' then if length(coalesce(input->>'title',''))>160 or length(coalesce(input->>'subtitle',''))>300 or jsonb_typeof(input->'showLogo')<>'boolean' or jsonb_typeof(input->'showContact')<>'boolean' then raise exception 'Título ou configuração de cabeçalho inválidos.';end if;if input->>'alignment' not in ('left','center','right') then raise exception 'Alinhamento inválido.';end if;
 elsif resource='brand_categories' then if length(trim(coalesce(input->>'name',''))) not between 1 and 80 then raise exception 'Informe uma categoria com até 80 caracteres.';end if;
 elsif resource='brand_assets' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or length(coalesce(input->>'dataURL',''))>11184842 or input->>'dataURL' !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or (input->>'width')::integer not between 1 and 10000 or (input->>'height')::integer not between 1 and 10000 or (input->>'width')::bigint*(input->>'height')::bigint>20000000 then raise exception 'PNG ou dimensões inválidos.';end if;
 if not exists(select 1 from public.brand_categories where company_id=company and data->>'name'=input->>'category') then raise exception 'Categoria não cadastrada.';end if;
 png:=decode(split_part(input->>'dataURL',',',2),'base64');if octet_length(png)<33 or substring(png from 1 for 8)<>decode('89504e470d0a1a0a','hex') or substring(png from 13 for 4)<>decode('49484452','hex') then raise exception 'Arquivo PNG inválido.';end if;
 png_width:=get_byte(png,16)::bigint*16777216+get_byte(png,17)*65536+get_byte(png,18)*256+get_byte(png,19);png_height:=get_byte(png,20)::bigint*16777216+get_byte(png,21)*65536+get_byte(png,22)*256+get_byte(png,23);if png_width<>(input->>'width')::bigint or png_height<>(input->>'height')::bigint then raise exception 'Dimensões declaradas não correspondem ao PNG.';end if;
 elsif resource='poster_templates' then input:=sp_private.validate_template(input);
 elsif resource='butcher_models' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 80 or length(trim(coalesce(input->>'category',''))) not between 1 and 40 or jsonb_typeof(input->'parts')<>'array' or jsonb_array_length(input->'parts')>100 then raise exception 'Modelo de cortes inválido.';end if;
 for item in select * from jsonb_array_elements(input->'parts') loop
 if length(trim(coalesce(item->>'name',''))) not between 1 and 80 or item->>'unit' not in ('KG','UN') then raise exception 'Parte inválida.';end if;
 amount:=coalesce((item->>'percentBps')::numeric,sp_private.decimal_scaled(item->>'percent',2,'Porcentagem'));
 if amount<=0 or amount>10000 then raise exception 'Porcentagem da parte inválida.';end if;
 if coalesce((item->>'active')::boolean,true) then sumval:=sumval+amount;end if;
 parts:=parts||jsonb_build_array(jsonb_build_object('id',coalesce(item->>'id',gen_random_uuid()::text),'name',trim(item->>'name'),'unit',item->>'unit','percentBps',amount,'active',coalesce((item->>'active')::boolean,true)));
 end loop;
 if sumval>10000 then raise exception 'A soma das partes não pode ultrapassar 100%%.';end if;
 if (select count(*) from jsonb_array_elements(parts))<>(select count(distinct lower(v->>'name')) from jsonb_array_elements(parts) v) then raise exception 'Há partes com nomes repetidos.';end if;
 family:=coalesce(old->>'familyId',input->>'familyId',gen_random_uuid()::text);
 if nullif(input->>'sourceId','') is not null then cat:=sp_private.catalog(company,'butcher_models',input->>'sourceId');family:=cat->>'familyId';if lower(cat->>'category')<>lower(input->>'category') then raise exception 'A nova versão deve manter a categoria.';end if;end if;
 select coalesce(max((data->>'version')::integer),0)+1 into nextversion from public.butcher_models where company_id=company and data->>'familyId'=family;
 input:=input||jsonb_build_object('parts',parts,'totalBps',sumval,'familyId',family,'version',coalesce((old->>'version')::integer,nextversion),'active',coalesce((old->>'active')::boolean,true),'current',coalesce((old->>'current')::boolean,false));
 elsif resource='quotes' then
 if length(trim(coalesce(input->>'title',''))) not between 1 and 200 or not sp_private.valid_date(input->>'date') then raise exception 'Informe a descrição e uma data válida para a cotação.';end if;
 if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_typeof(input->'providers') is distinct from 'array' then raise exception 'Listas da cotação inválidas.';end if;
 if length(coalesce(input->>'notes',''))>4000 then raise exception 'A observação deve ter até 4.000 caracteres.';end if;
 if input->>'status' not in ('open','finished') then raise exception 'Situação da cotação inválida.';end if;
 if input->>'status'='finished' and (jsonb_array_length(input->'items')=0 or jsonb_array_length(input->'providers')=0) then raise exception 'Adicione produtos e fornecedores antes de finalizar a cotação.';end if;
 input:=input||jsonb_build_object('title',trim(input->>'title'),'notes',coalesce(input->>'notes',''));
 for item in select * from jsonb_array_elements(input->'items') loop cat:=sp_private.catalog(company,'products',item->>'productId');quantity:=sp_private.decimal_scaled(item->>'quantity',3,'Quantidade')/1000;
 select v into previous from jsonb_array_elements(coalesce(old->'items','[]')) v where v->>'id'=item->>'id';
 items:=items||jsonb_build_array(jsonb_build_object('id',coalesce(item->>'id',gen_random_uuid()::text),'productId',cat->>'id','name',cat->>'name','category',cat->>'category','unit',cat->>'unit','quantity',quantity)||sp_private.product_photo_snapshot(coalesce(previous,cat)));end loop;
 if jsonb_array_length(items)<>(select count(distinct i->>'productId') from jsonb_array_elements(items) i) then raise exception 'Produto repetido na cotação.';end if;
 input:=input||jsonb_build_object('items',items,'offers',coalesce(input->'offers','{}'),'awards',coalesce(input->'awards','{}'),'status',coalesce(input->>'status','open'));
 items:='[]';for item in select * from jsonb_array_elements(input->'providers') loop cat:=sp_private.catalog(company,'partners',item->>'id');if cat->>'type' not in ('Fornecedor','Ambos') then raise exception 'Selecione um fornecedor cadastrado.';end if;items:=items||jsonb_build_array(jsonb_build_object('id',cat->>'id','name',cat->>'name'));end loop;input:=input||jsonb_build_object('providers',items);if jsonb_array_length(items)<>(select count(distinct i->>'id') from jsonb_array_elements(items) i) then raise exception 'Fornecedor repetido na cotação.';end if;
 for key,value in select * from jsonb_each(input->'offers') loop
 if not exists(select 1 from jsonb_array_elements(input->'items') i where i->>'id'=key) then raise exception 'Oferta de produto inválido.';end if;
 for cat in select jsonb_build_object('key',k,'value',v) from jsonb_each(value) a(k,v) loop
 if not exists(select 1 from jsonb_array_elements(input->'providers') p where p->>'id'=cat->>'key') or (cat->>'value')::numeric not between 1 and 100000000 or trunc((cat->>'value')::numeric)<>(cat->>'value')::numeric then raise exception 'Preço ou fornecedor inválido.';end if;end loop;end loop;
 for key,value in select * from jsonb_each(input->'awards') loop if input#>>array['offers',key,value#>>'{}'] is null then raise exception 'Escolha um fornecedor com preço válido.';end if;end loop;
 input:=input||jsonb_build_object('computed',sp_private.quote_computed(input));
 elsif resource='hortifruti_receipts' then
 cat:=sp_private.catalog(company,'partners',coalesce(input->>'partnerId',input#>>'{partner,id}'));if not sp_private.valid_date(input->>'date') then raise exception 'Data inválida.';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop
 unit:=sp_private.catalog(company,'units',item->>'unit');if upper(unit->>'symbol')<>'KG' then raise exception 'Informe as pesagens em KG.';end if;cat:=sp_private.catalog(company,'products',item->>'productId');
 if item ? 'quantityMicros' then
 value:=jsonb_build_object('quantity',case when item->>'quantityMicros' is not null then ((item->>'quantityMicros')::numeric/1000000)::text else '' end,'unitCost',case when item->>'unitMicros' is not null then ((item->>'unitMicros')::numeric/1000000)::text else '' end,'total',case when item->>'totalCents' is not null then ((item->>'totalCents')::numeric/100)::text else '' end,'basis',item->>'basis','weighMode',coalesce(item->>'weighMode','total'),'unitCount',item->>'unitCount','boxes',(select coalesce(jsonb_agg(case when b='null'::jsonb then '' else trim_scale((b#>>'{}')::numeric/1000000)::text end),'[]') from jsonb_array_elements(coalesce(item->'boxes','[]')) b),'previousWeight',case when item->>'previousWeightMicros' is not null then trim_scale((item->>'previousWeightMicros')::numeric/1000000)::text else '' end);
 else value:=item;end if;
 value:=sp_private.horti_line(value);total:=total+coalesce((value->>'totalCents')::numeric,0);if value->>'quantityMicros' is null or value->>'unitMicros' is null or value->>'totalCents' is null or coalesce((value->>'boxesIncomplete')::boolean,false) then sumval:=sumval+1;end if;
 select v into previous from jsonb_array_elements(coalesce(old->'items','[]')) v where v->>'productId'=item->>'productId';
 items:=items||jsonb_build_array(item||value||jsonb_build_object('name',cat->>'name','code',cat->>'code','unitSymbol','KG')||sp_private.product_photo_snapshot(coalesce(previous,cat)));
 end loop;
 cat:=sp_private.catalog(company,'partners',coalesce(input->>'partnerId',input#>>'{partner,id}'));input:=input||jsonb_build_object('items',items,'partner',jsonb_build_object('id',cat->>'id','name',cat->>'name'),'status',coalesce(input->>'status','pending'),'computed',jsonb_build_object('summary',jsonb_build_object('total',case when total>0 then total end,'incomplete',sumval)));
 elsif resource='supplier_returns' then
 cat:=sp_private.catalog(company,'partners',coalesce(input->>'supplierId',input#>>'{supplier,id}'));if cat->>'type' not in ('Fornecedor','Ambos') or not sp_private.valid_date(input->>'date') or trim(coalesce(input->>'number',''))='' or trim(coalesce(input->>'originalInvoice',''))='' or trim(coalesce(input->>'reason',''))='' then raise exception 'Fornecedor, data, nota ou motivo inválido.';end if;
 input:=input||jsonb_build_object('supplier',coalesce(old->'supplier',jsonb_build_object('id',cat->>'id','name',cat->>'name')));
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop cat:=case when old is not null then item||jsonb_build_object('id',item->>'productId') else sp_private.catalog(company,'products',item->>'productId') end;quantity:=sp_private.decimal_scaled(item->>'quantity',3,'Quantidade')/1000;amount:=case when item ? 'unitCents' then (item->>'unitCents')::numeric else sp_private.decimal_scaled(item->>'unitValue',2,'Preço') end;
 if amount<1 or amount>100000000 then raise exception 'Preço fora do limite.';end if;value:=jsonb_build_object('productId',cat->>'id','name',cat->>'name','unit',cat->>'unit','quantity',quantity,'unitCents',amount,'totalCents',round(quantity*amount))||sp_private.product_photo_snapshot(cat);total:=total+round(quantity*amount);items:=items||jsonb_build_array(value);end loop;
 if jsonb_array_length(items)=0 or (select count(*) from jsonb_array_elements(items))<>(select count(distinct i->>'productId') from jsonb_array_elements(items) i) then raise exception 'Adicione produtos sem duplicação.';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'settlements','[]')) loop if item->>'method' not in ('pix','dinheiro','transferencia','credito','abatimento','outro') or not sp_private.valid_date(item->>'date') or (item->>'date')<(input->>'date') or (item->>'amountCents')::numeric<=0 then raise exception 'Acerto inválido.';end if;settled:=settled+(item->>'amountCents')::numeric;end loop;
 if settled>total then raise exception 'O acerto não pode superar o saldo pendente.';end if;
 input:=input||jsonb_build_object('items',items,'settlements',coalesce(input->'settlements','[]'),'computed',jsonb_build_object('totals',jsonb_build_object('total',total,'settled',settled,'pending',total-settled,'status',case when settled=0 then 'Pendente' when settled<total then 'Parcial' else 'Resolvida' end)));
 elsif resource='campaigns' then
 if trim(coalesce(input->>'name',''))='' or length(input->>'name')>100 or not sp_private.valid_date(input->>'start') or not sp_private.valid_date(input->>'end') or input->>'start'>input->>'end' then raise exception 'Nome ou período da campanha inválidos.';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop
 cat:=sp_private.catalog(company,'products',item->>'productId');select v into previous from jsonb_array_elements(coalesce(old->'items','[]')) v where v->>'id'=item->>'id';item:=item||sp_private.product_photo_snapshot(coalesce(previous,cat));
 if not item ?& array['productId','name','cents','quantity','unit','printLayout','templateSnapshot'] or item->'cents'='null'::jsonb or item->'quantity'='null'::jsonb or (item->>'cents')::numeric not between 1 and 999999 or (item->>'quantity')::integer not between 1 and 100 or item->>'unit' not in ('kg','unid') or item->>'printLayout' not in ('individual','two-a4') then raise exception 'Preço, quantidade ou impressão inválidos.';end if;
 perform sp_private.validate_template(item->'templateSnapshot');if item->>'printLayout'='two-a4' and ((item#>>'{templateSnapshot,widthMm}')::numeric>148.5 or (item#>>'{templateSnapshot,heightMm}')::numeric>210) then raise exception 'O modelo não cabe em 2 por A4.';end if;
 items:=items||jsonb_build_array(item);end loop;input:=input||jsonb_build_object('items',items);
 elsif resource='price_tables' then
 if input->>'status' not in ('draft','sent','finalized') then raise exception 'Etapa inválida.';end if;
 if input->>'status'<>'draft' then
 if input->'productSnapshot'='null'::jsonb or input->'templateSnapshot'='null'::jsonb or trim(coalesce(input->>'name',''))='' then raise exception 'Selecione produto e modelo.';end if;
 perform sp_private.validate_template(input->'templateSnapshot');amount:=sp_private.brl_cents(input->>'priceRaw');
 if (input->>'quantity') !~ '^\d+$' or (input->>'quantity')::integer not between 1 and 200 or input->>'printLayout' not in ('individual','two-a4') then raise exception 'Quantidade ou impressão inválida.';end if;
 if coalesce(input->>'start','')<>'' or coalesce(input->>'end','')<>'' then if not sp_private.valid_date(input->>'start') or not sp_private.valid_date(input->>'end') or input->>'start'>input->>'end' then raise exception 'Validade inválida.';end if;end if;
 if input->>'printLayout'='two-a4' and ((input#>>'{templateSnapshot,widthMm}')::numeric>148.5 or (input#>>'{templateSnapshot,heightMm}')::numeric>210) then raise exception 'O modelo não cabe em 2 por A4.';end if;
 input:=input||jsonb_build_object('cents',amount,'quantity',(input->>'quantity')::integer);
 else begin amount:=sp_private.brl_cents(input->>'priceRaw',true);exception when others then amount:=null;end;input:=input||jsonb_build_object('cents',amount);end if;
 elsif resource='calendar_events' then
 if not sp_private.valid_date(input->>'date') or length(trim(coalesce(input->>'title',''))) not between 1 and 120 or input->>'type' not in ('event','note') or input->>'color' not in ('blue','green','orange','purple','red') or length(coalesce(input->>'notes',''))>4000 or (coalesce(input->>'time','')<>'' and input->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Título, data ou configuração do evento inválidos.';end if;
 elsif resource='home_notices' then if length(coalesce(input->>'text',''))>240 then raise exception 'Use até 240 caracteres no aviso.';end if;
 elsif resource='flyers' then
 if octet_length(input::text)>26214400 or (input->>'width')::numeric not between 320 and 4096 or (input->>'height')::numeric not between 320 and 4096 or (input->>'width')::numeric*(input->>'height')::numeric>16000000 or coalesce(jsonb_typeof(input->'elements'),'null')<>'array' or jsonb_array_length(input->'elements')>200 then raise exception 'Dimensões ou elementos da arte inválidos.';end if;
 for item in select * from jsonb_array_elements(input->'elements') loop
 if item->>'type' not in ('text','product','image','shape') or (item->>'width')::numeric<=0 or (item->>'height')::numeric<=0 or (item->>'x')::numeric<0 or (item->>'y')::numeric<0 then raise exception 'Elemento da arte inválido.';end if;
 foreach key in array array['src','image'] loop if coalesce(item->>key,'')<>'' and item->>key<>'./assets/logo-original.jpg' and item->>key !~ '^\./assets/encartes/camadas/[a-z0-9-]+\.png$' and item->>key !~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Imagem da arte inválida.';end if;end loop;
 end loop;
 end if;
 return input;
end $$;


notify pgrst,'reload schema';
