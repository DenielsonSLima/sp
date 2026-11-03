-- Incremental domain tables. The original foundation migration remains unchanged.
alter table public.audit_log add column details jsonb not null default '{}'::jsonb;
do $tables$ declare resource text;begin
 foreach resource in array array['product_categories','flyer_templates','flyer_assets'] loop
 execute format('create table public.%I (company_id uuid not null references public.companies(id),id text not null check(id ~ ''^[A-Za-z0-9_-]{1,100}$'' and id not in (''__proto__'',''constructor'',''prototype'')),data jsonb not null check(jsonb_typeof(data)=''object''),version bigint not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,id))',resource);
 execute format('create index %I on public.%I(company_id,updated_at desc,id)',resource||'_company_updated',resource);
 end loop;
end $tables$;
create unique index product_categories_company_name on public.product_categories(company_id,lower(data->>'name'));
alter table public.product_categories add constraint product_categories_fields check(coalesce(length(trim(data->>'name')) between 1 and 80,false));
create or replace function sp_private.module_for(resource text) returns text language sql immutable set search_path='' as $$
 select case when resource in ('units','partners','products','product_categories','brand_assets','brand_categories','poster_templates','butcher_models') then 'cadastros'
 when resource in ('profiles','user_access','company_settings','watermarks','headers') then 'configuracoes'
 when resource='quotes' then 'cotacao' when resource='hortifruti_receipts' then 'hortifruti'
 when resource='butcher_receipts' then 'acougue' when resource='supplier_returns' then 'devolucoes'
 when resource='campaigns' then 'promocoes' when resource='price_tables' then 'tabela-precos'
 when resource='calendar_events' then 'calendario' when resource in ('flyers','flyer_templates','flyer_assets') then 'encartes' when resource='home_notices' then 'inicio' end
$$;

create or replace function sp_private.allowed(company uuid,resource text,writing boolean default false) returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.memberships m left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id
 where m.company_id=company and m.user_id=auth.uid() and m.active
 and (m.role in ('owner','admin') or (
 sp_private.module_for(resource) is not null and not (writing and sp_private.module_for(resource)='configuracoes')
 and (resource in ('units','partners','products','product_categories','poster_templates','brand_assets','brand_categories','company_settings','watermarks','headers') and not writing
 or coalesce(p.data->'modules','[]'::jsonb) ? sp_private.module_for(resource)))))
$$;

create or replace function sp_private.assert_resource(resource text) returns void language plpgsql immutable set search_path='' as $$ begin
 if resource is null or not resource=any(array['units','partners','products','profiles','company_settings','watermarks','headers','brand_assets','brand_categories','poster_templates','butcher_models','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','calendar_events','flyers','home_notices','user_access','product_categories','flyer_templates','flyer_assets']) then raise exception 'Recurso inválido.';end if;
end $$;

create or replace function sp_private.validate_record(company uuid,resource text,input jsonb,old jsonb default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare item jsonb;items jsonb:='[]';cat jsonb;unit jsonb;parts jsonb:='[]';sumval numeric:=0;amount numeric;quantity numeric;total numeric:=0;settled numeric:=0;key text;value jsonb;family text;required text[];nextversion integer;png bytea;png_width bigint;png_height bigint;begin
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
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or input->>'type' not in ('Fornecedor','Cliente','Ambos','Outro') then raise exception 'Nome ou tipo de parceiro inválido.';end if;
 input:=jsonb_build_object('id',input->>'id','name',trim(input->>'name'),'type',input->>'type','email',left(trim(coalesce(input->>'email','')),254),'phone',left(trim(coalesce(input->>'phone','')),40));
 elsif resource='product_categories' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 80 or input->>'name' ~ '[[:cntrl:]]' then raise exception 'Informe uma categoria com até 80 caracteres.';end if;
 input:=jsonb_build_object('id',input->>'id','name',trim(input->>'name'));
 elsif resource='flyer_assets' then
 if length(trim(coalesce(input->>'label',''))) not between 1 and 100 or input->>'kind' not in ('background','sticker') or input->>'src'<>'./assets/encartes/camadas/'||(input->>'id')||'.png' or (input->>'width')::integer not between 1 and 10000 or (input->>'height')::integer not between 1 and 10000 or (input->>'width')::bigint*(input->>'height')::bigint>20000000 then raise exception 'Recurso gráfico inválido.';end if;
 elsif resource='flyer_templates' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or input->>'kind' not in ('simple','layered') or (input->>'productCount')::integer not between 1 and 200 or (input->>'width')::numeric not between 320 and 4096 or (input->>'height')::numeric not between 320 and 4096 then raise exception 'Modelo de encarte inválido.';end if;
 if (input#>>'{definition,width}')::numeric<>(input->>'width')::numeric or (input#>>'{definition,height}')::numeric<>(input->>'height')::numeric then raise exception 'Dimensões do modelo e da definição não correspondem.';end if;
 perform sp_private.validate_record(company,'flyers',input->'definition');
 elsif resource='products' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or length(coalesce(input->>'code',''))>40 then raise exception 'Nome ou código de produto inválido.';end if;
 if not exists(select 1 from public.product_categories where company_id=company and lower(data->>'name')=lower(trim(coalesce(input->>'category','')))) then raise exception 'Selecione uma categoria cadastrada.';end if;
 select data into cat from public.product_categories where company_id=company and lower(data->>'name')=lower(trim(input->>'category'));input:=input||jsonb_build_object('category',cat->>'name');
 unit:=sp_private.catalog(company,'units',input->>'unit');
 items:=coalesce(input->'photos',case when coalesce(input->>'photo','')<>'' then jsonb_build_array(input->>'photo') else '[]'::jsonb end);
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5 then raise exception 'Galeria de fotos inválida.';end if;
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
 if length(trim(coalesce(input->>'title',''))) not between 1 and 200 or not sp_private.valid_date(input->>'date') or jsonb_array_length(coalesce(input->'items','[]'))=0 or jsonb_array_length(coalesce(input->'providers','[]'))=0 then raise exception 'Preencha título, data, produtos e fornecedores da cotação.';end if;
 for item in select * from jsonb_array_elements(input->'items') loop cat:=sp_private.catalog(company,'products',item->>'productId');quantity:=sp_private.decimal_scaled(item->>'quantity',3,'Quantidade')/1000;
 items:=items||jsonb_build_array(jsonb_build_object('id',coalesce(item->>'id',gen_random_uuid()::text),'productId',cat->>'id','name',cat->>'name','category',cat->>'category','unit',cat->>'unit','quantity',quantity));end loop;
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
 items:=items||jsonb_build_array(item||value||jsonb_build_object('name',cat->>'name','code',cat->>'code','unitSymbol','KG'));
 end loop;
 cat:=sp_private.catalog(company,'partners',coalesce(input->>'partnerId',input#>>'{partner,id}'));input:=input||jsonb_build_object('items',items,'partner',jsonb_build_object('id',cat->>'id','name',cat->>'name'),'status',coalesce(input->>'status','pending'),'computed',jsonb_build_object('summary',jsonb_build_object('total',case when total>0 then total end,'incomplete',sumval)));
 elsif resource='supplier_returns' then
 cat:=sp_private.catalog(company,'partners',coalesce(input->>'supplierId',input#>>'{supplier,id}'));if cat->>'type' not in ('Fornecedor','Ambos') or not sp_private.valid_date(input->>'date') or trim(coalesce(input->>'number',''))='' or trim(coalesce(input->>'originalInvoice',''))='' or trim(coalesce(input->>'reason',''))='' then raise exception 'Fornecedor, data, nota ou motivo inválido.';end if;
 input:=input||jsonb_build_object('supplier',coalesce(old->'supplier',jsonb_build_object('id',cat->>'id','name',cat->>'name')));
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop cat:=case when old is not null then item||jsonb_build_object('id',item->>'productId') else sp_private.catalog(company,'products',item->>'productId') end;quantity:=sp_private.decimal_scaled(item->>'quantity',3,'Quantidade')/1000;amount:=case when item ? 'unitCents' then (item->>'unitCents')::numeric else sp_private.decimal_scaled(item->>'unitValue',2,'Preço') end;
 if amount<1 or amount>100000000 then raise exception 'Preço fora do limite.';end if;value:=jsonb_build_object('productId',cat->>'id','name',cat->>'name','unit',cat->>'unit','quantity',quantity,'unitCents',amount,'totalCents',round(quantity*amount));total:=total+round(quantity*amount);items:=items||jsonb_build_array(value);end loop;
 if jsonb_array_length(items)=0 or (select count(*) from jsonb_array_elements(items))<>(select count(distinct i->>'productId') from jsonb_array_elements(items) i) then raise exception 'Adicione produtos sem duplicação.';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'settlements','[]')) loop if item->>'method' not in ('pix','dinheiro','transferencia','credito','abatimento','outro') or not sp_private.valid_date(item->>'date') or (item->>'date')<(input->>'date') or (item->>'amountCents')::numeric<=0 then raise exception 'Acerto inválido.';end if;settled:=settled+(item->>'amountCents')::numeric;end loop;
 if settled>total then raise exception 'O acerto não pode superar o saldo pendente.';end if;
 input:=input||jsonb_build_object('items',items,'settlements',coalesce(input->'settlements','[]'),'computed',jsonb_build_object('totals',jsonb_build_object('total',total,'settled',settled,'pending',total-settled,'status',case when settled=0 then 'Pendente' when settled<total then 'Parcial' else 'Resolvida' end)));
 elsif resource='campaigns' then
 if trim(coalesce(input->>'name',''))='' or length(input->>'name')>100 or not sp_private.valid_date(input->>'start') or not sp_private.valid_date(input->>'end') or input->>'start'>input->>'end' then raise exception 'Nome ou período da campanha inválidos.';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop
 perform sp_private.catalog(company,'products',item->>'productId');
 if not item ?& array['productId','name','cents','quantity','unit','printLayout','templateSnapshot'] or item->'cents'='null'::jsonb or item->'quantity'='null'::jsonb or (item->>'cents')::numeric not between 1 and 999999 or (item->>'quantity')::integer not between 1 and 100 or item->>'unit' not in ('kg','unid') or item->>'printLayout' not in ('individual','two-a4') then raise exception 'Preço, quantidade ou impressão inválidos.';end if;
 perform sp_private.validate_template(item->'templateSnapshot');if item->>'printLayout'='two-a4' and ((item#>>'{templateSnapshot,widthMm}')::numeric>148.5 or (item#>>'{templateSnapshot,heightMm}')::numeric>210) then raise exception 'O modelo não cabe em 2 por A4.';end if;
 end loop;
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

create or replace function sp_private.persist_record(company uuid,resource text,input jsonb,expected bigint default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare key text:=coalesce(nullif(input->>'id',''),gen_random_uuid()::text);old jsonb;currentversion bigint;nextversion bigint;clean jsonb;usr uuid;profilekey text;rol text;source text;target text;row record;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 perform pg_advisory_xact_lock(hashtextextended(company::text||resource||key,0));
 if resource='user_access' then
 select id into usr from auth.users where lower(email)=lower(trim(input->>'email'));
 if usr is null then raise exception 'O e-mail ainda não possui conta Auth. Cadastre ou convide essa pessoa no Supabase Auth antes de liberar o acesso.';end if;
 select id into profilekey from public.profiles where company_id=company and (id=input->>'profileId' or data->>'name'=input->>'profile') limit 1;
 if profilekey is null then raise exception 'Selecione um perfil válido.';end if;
 select version,role into currentversion,rol from public.memberships where company_id=company and user_id=usr for update;
 if currentversion is not null and expected is distinct from currentversion then raise exception 'Este acesso foi alterado. Recarregue antes de salvar.' using errcode='40001';end if;
 if rol='owner' and (coalesce((input->>'active')::boolean,true)=false or coalesce(input->>'role',rol)<>'owner') then raise exception 'O proprietário não pode ser removido ou rebaixado por esta operação.';end if;
 if usr=auth.uid() and not coalesce((input->>'active')::boolean,true) then raise exception 'Você não pode desativar seu próprio acesso.';end if;
 rol:=coalesce(rol,'member');
 insert into public.memberships(company_id,user_id,profile_id,display_name,active,role) values(company,usr,profilekey,left(trim(input->>'name'),100),coalesce((input->>'active')::boolean,true),rol)
 on conflict(company_id,user_id) do update set profile_id=excluded.profile_id,display_name=excluded.display_name,active=excluded.active,version=memberships.version+1,updated_at=now();
 insert into public.audit_log(company_id,actor_id,resource,record_id,action) values(company,auth.uid(),resource,usr::text,'save');return sp_private.read_record(company,resource,usr::text);
 end if;
 if resource='brand_categories' and input->>'action' in ('rename','remove') then
 source:=input->>'source';target:=coalesce(input->>'target',input->>'name');
 if source='Sem categoria' or source is null or target is null or length(trim(target)) not between 1 and 80 then raise exception 'Categoria de origem ou destino inválida.';end if;
 select id,data,version into row from public.brand_categories where company_id=company and data->>'name'=source for update;
 if not found then raise exception 'Categoria não encontrada.';end if;
 if input->>'action'='remove' then
 if not exists(select 1 from public.brand_categories where company_id=company and data->>'name'=target) then raise exception 'Categoria de destino não encontrada.';end if;
 delete from public.brand_categories where company_id=company and id=row.id;
 else update public.brand_categories set data=data||jsonb_build_object('name',trim(target)),version=version+1,updated_at=now() where company_id=company and id=row.id;end if;
 update public.brand_assets set data=data||jsonb_build_object('category',trim(target)),version=version+1,updated_at=now() where company_id=company and data->>'category'=source;
 return jsonb_build_object('id',row.id,'name',trim(target),'_version',row.version+1);
 end if;
 if resource='butcher_models' and input->>'action' in ('current','setCurrent','toggle') then
 execute 'select data,version from public.butcher_models where company_id=$1 and id=$2 for update' into old,currentversion using company,key;
 if old is null then raise exception 'Modelo não encontrado.';end if;
 if expected is distinct from currentversion then raise exception 'Modelo alterado. Recarregue antes de salvar.' using errcode='40001';end if;
 if input->>'action' in ('current','setCurrent') then
 if not coalesce((old->>'active')::boolean,true) or (old->>'totalBps')::numeric<=0 then raise exception 'Escolha um modelo ativo com partes.';end if;
 update public.butcher_models set data=data||'{"current":false}',version=version+1,updated_at=now() where company_id=company and lower(data->>'category')=lower(old->>'category') and (data->>'current')::boolean;
 old:=old||'{"current":true}';
 else
 if coalesce((old->>'current')::boolean,false) and not coalesce((input->>'confirmCurrent')::boolean,false) then raise exception 'Confirme a inativação do modelo atual.';end if;
 old:=old||jsonb_build_object('active',not coalesce((old->>'active')::boolean,true),'current',false);end if;
 update public.butcher_models set data=old,version=version+1,updated_at=now() where company_id=company and id=key;
 return sp_private.read_record(company,resource,key);
 end if;
 execute format('select data,version from public.%I where company_id=$1 and id=$2 for update',resource) into old,currentversion using company,key;
 if old is not null and expected is distinct from currentversion then raise exception 'Este registro foi alterado em outra sessão. Recarregue antes de salvar.' using errcode='40001';end if;
 if old is null and expected is not null then raise exception 'Registro removido por outra sessão.' using errcode='40001';end if;
 -- Business documents use commands for transitions; clients cannot forge finalized snapshots or settlement history.
 
 clean:=sp_private.validate_record(company,resource,input||jsonb_build_object('id',key),old);
 nextversion:=coalesce(currentversion,0)+1;
 if resource='product_categories' and old is not null and old->>'name' is distinct from clean->>'name' then
 update public.products set data=data||jsonb_build_object('category',clean->>'name'),version=version+1,updated_at=now() where company_id=company and lower(data->>'category')=lower(old->>'name');
 end if;
 execute format('insert into public.%I(company_id,id,data,version) values($1,$2,$3,$4) on conflict(company_id,id) do update set data=excluded.data,version=excluded.version,updated_at=now()',resource) using company,key,clean,nextversion;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version) values(company,auth.uid(),resource,key,case when old is null then 'create' else 'update' end,nextversion);
 return clean||jsonb_build_object('id',key,'_version',nextversion);
end $$;

create or replace function sp_private.delete_record(company uuid,resource text,key text,expected bigint default null) returns boolean language plpgsql security definer set search_path='' as $$
 declare currentversion bigint;ref text;linked boolean;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 if resource in ('quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','company_settings','watermarks','headers','user_access') then raise exception 'Este registro deve ser mantido para preservar o histórico.';end if;
 execute format('select version from public.%I where company_id=$1 and id=$2 for update',resource) into currentversion using company,key;
 if currentversion is null then raise exception 'Registro não encontrado.';end if;
 if expected is distinct from currentversion then raise exception 'Registro alterado por outra sessão. Recarregue antes de excluir.' using errcode='40001';end if;
 if resource='units' and exists(select 1 from public.products where company_id=company and data->>'unit'=key) then raise exception 'A unidade está vinculada a produtos.';end if;
 if resource='products' then
 foreach ref in array array['quotes','hortifruti_receipts','supplier_returns','campaigns'] loop
 execute format('select exists(select 1 from public.%I r,jsonb_array_elements(r.data->''items'') i where r.company_id=$1 and i->>''productId''=$2)',ref) into linked using company,key;if linked then raise exception 'O produto está vinculado a documentos de %.',ref;end if;end loop;
 if exists(select 1 from public.price_tables where company_id=company and data->>'productId'=key) then raise exception 'O produto está vinculado à tabela de preços.';end if;end if;
 if resource='partners' and (exists(select 1 from public.hortifruti_receipts where company_id=company and data#>>'{partner,id}'=key) or exists(select 1 from public.supplier_returns where company_id=company and data#>>'{supplier,id}'=key) or exists(select 1 from public.quotes q,jsonb_array_elements(q.data->'providers') p where q.company_id=company and p->>'id'=key)) then raise exception 'O parceiro está vinculado a documentos operacionais.';end if;
 if resource='product_categories' and exists(select 1 from public.products where company_id=company and lower(data->>'category')=(select lower(data->>'name') from public.product_categories where company_id=company and id=key)) then raise exception 'A categoria está vinculada a produtos.';end if;
 if resource='profiles' and exists(select 1 from public.memberships where company_id=company and profile_id=key) then raise exception 'O perfil está vinculado a usuários.';end if;
 if resource='brand_categories' and exists(select 1 from public.brand_assets where company_id=company and data->>'category'=(select data->>'name' from public.brand_categories where company_id=company and id=key)) then raise exception 'Mova os elementos antes de remover a categoria.';end if;
 execute format('delete from public.%I where company_id=$1 and id=$2',resource) using company,key;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version) values(company,auth.uid(),resource,key,'delete',currentversion);return true;
end $$;
create or replace function sp_private.calculate(company uuid,kind text,input jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;item jsonb;items jsonb:='[]';quantity numeric;price numeric;total numeric:=0;begin
 if kind='poster_template_draft' then perform sp_private.require_access(company,'poster_templates',true);return '{"id":"new-poster-draft","name":"Novo modelo","headline":"OFERTA","productText":"{{produto}}","color":"#c51d2b","background":"#ffffff","font":"Arial","scale":1,"widthMm":148,"heightMm":210,"layout":{"headline":{"x":0.05,"y":0.02,"w":0.9,"h":0.1,"fontSize":4,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0.1,"lineHeight":1.1},"product":{"x":0.04,"y":0.17,"w":0.92,"h":0.25,"fontSize":8.5,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1.08},"price":{"x":0.04,"y":0.43,"w":0.92,"h":0.36,"fontSize":29,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1},"validity":{"x":0.04,"y":0.86,"w":0.92,"h":0.1,"fontSize":2.5,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1.4}}}'::jsonb;
 elsif kind in ('hortifruti_line','hortifruti') then perform sp_private.require_access(company,'hortifruti_receipts');return sp_private.horti_line(input);
 elsif kind='butcher' then return sp_private.butcher_estimate(company,input);
 elsif kind in ('supplier_return_line','supplier_return_preview') then
 perform sp_private.require_access(company,'supplier_returns');
 if kind='supplier_return_line' then quantity:=sp_private.decimal_scaled(input->>'quantity',3,'Quantidade')/1000;price:=sp_private.decimal_scaled(input->>'unitValue',2,'Preço');return jsonb_build_object('quantity',quantity,'unitCents',price,'totalCents',round(quantity*price));end if;
 for item in select * from jsonb_array_elements(coalesce(input->'items','[]')) loop
 quantity:=sp_private.decimal_scaled(item->>'quantity',3,'Quantidade')/1000;price:=sp_private.decimal_scaled(item->>'unitValue',2,'Preço');total:=total+round(quantity*price);items:=items||jsonb_build_array(item||jsonb_build_object('quantity',quantity,'unitCents',price,'totalCents',round(quantity*price)));end loop;
 return jsonb_build_object('items',items,'total',total);
 elsif kind='quote' then perform sp_private.require_access(company,'quotes');return sp_private.quote_computed(input);
 elsif kind='home_summary' then
 perform sp_private.require_access(company,'home_notices');
 return jsonb_build_object(
 'quotes',(select count(*) from public.quotes where company_id=company and data->>'status'='open' and sp_private.allowed(company,'quotes')),
 'purchases',(select count(*) from public.hortifruti_receipts where company_id=company and data->>'status'='pending' and not coalesce((data->>'entryConfirmed')::boolean,false) and sp_private.allowed(company,'hortifruti_receipts')),
 'campaigns',(select count(*) from public.campaigns where company_id=company and (data->>'start')::date<=(now() at time zone 'America/Maceio')::date and (data->>'end')::date>=(now() at time zone 'America/Maceio')::date and (data->>'end')::date<=(now() at time zone 'America/Maceio')::date+7 and sp_private.allowed(company,'campaigns')),
 'printing',(select count(*) from public.price_tables where company_id=company and data->>'status'='sent' and data->>'archivedAt' is null and sp_private.allowed(company,'price_tables')),
 'products',(select count(*) from public.products where company_id=company),
 'notice',(select data->>'text' from public.home_notices where company_id=company and id='main'));
 else raise exception 'Cálculo inválido.';end if;
end $$;

do $security$ declare resource text;begin
 foreach resource in array array['product_categories','flyer_templates','flyer_assets'] loop
 execute format('alter table public.%I enable row level security',resource);
 execute format('revoke all on public.%I from public,anon,authenticated',resource);
 execute format('grant select on public.%I to authenticated',resource);
 execute format('create policy company_module_read on public.%I for select to authenticated using(sp_private.allowed(company_id,%L))',resource,resource);
 execute format('create trigger signal_resource_change after insert or update or delete on public.%I for each row execute function sp_private.track_resource_change()',resource);
 end loop;
end $security$;
notify pgrst,'reload schema';
