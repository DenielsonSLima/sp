-- Quotes may start with a header only; completion still requires items, providers and valid awards.
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
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or input->>'type' not in ('Fornecedor','Cliente','Ambos','Outro') then raise exception 'Nome ou tipo de parceiro inválido.';end if;
 input:=jsonb_build_object('id',input->>'id','name',trim(input->>'name'),'type',input->>'type','email',left(trim(coalesce(input->>'email','')),254),'phone',left(trim(coalesce(input->>'phone','')),40));
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


create or replace function sp_private.quote_computed(q jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
 declare totals jsonb:='[]';awarded jsonb:='[]';comparisons jsonb:='{}';line_totals jsonb:='{}';provider jsonb;item jsonb;prices jsonb;lines jsonb;minimum_total numeric;lowest_count integer;ptot numeric;selected numeric:=0;minprice numeric;price numeric;lt numeric;complete boolean;lowest jsonb;counted integer;begin
 for provider in select * from jsonb_array_elements(q->'providers') loop
 ptot:=0;complete:=jsonb_array_length(coalesce(q->'items','[]'::jsonb))>0;lines:='[]';
 for item in select * from jsonb_array_elements(q->'items') loop
 price:=(q#>>array['offers',item->>'id',provider->>'id'])::numeric;
 if price is null then complete:=false;else
 lt:=round(price*(item->>'quantity')::numeric);ptot:=ptot+lt;
 line_totals:=jsonb_set(line_totals,array[item->>'id'],coalesce(line_totals->(item->>'id'),'{}')||jsonb_build_object(provider->>'id',lt),true);
 if q#>>array['awards',item->>'id']=provider->>'id' then lines:=lines||jsonb_build_array(item||jsonb_build_object('unitPrice',price,'total',lt));selected:=selected+lt;end if;end if;
 end loop;
 totals:=totals||jsonb_build_array(provider||jsonb_build_object('complete',complete,'total',case when complete then ptot end,'subtotal',ptot));
 select coalesce(sum((v->>'total')::numeric),0) into ptot from jsonb_array_elements(lines) v;
 awarded:=awarded||jsonb_build_array(provider||jsonb_build_object('items',lines,'total',ptot));
 end loop;
 for item in select * from jsonb_array_elements(q->'items') loop
 minprice:=null;lowest:='[]';counted:=0;
 for provider in select * from jsonb_array_elements(q->'providers') loop
 price:=(q#>>array['offers',item->>'id',provider->>'id'])::numeric;
 if price is not null then counted:=counted+1;if minprice is null or price<minprice then minprice:=price;lowest:=jsonb_build_array(provider->>'id');elsif price=minprice then lowest:=lowest||jsonb_build_array(provider->>'id');end if;end if;
 end loop;
 comparisons:=comparisons||jsonb_build_object(item->>'id',jsonb_build_object('min',minprice,'lowest',lowest,'priced',counted));
 end loop;
 select min((v->>'total')::numeric) into minimum_total from jsonb_array_elements(totals) v where (v->>'complete')::boolean;select count(*) into lowest_count from jsonb_array_elements(totals) v where (v->>'total')::numeric=minimum_total;
 return jsonb_build_object('minimumCompleteTotal',minimum_total,'lowestCompleteCount',lowest_count,'totals',totals,'selectedTotal',selected,'comparisons',comparisons,'awardedByProvider',awarded,'lineTotals',line_totals);
end $$;
create or replace function sp_private.command(company uuid,resource text,action text,key text default null,payload jsonb default '{}',expected bigint default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare doc jsonb;result jsonb;item jsonb;items jsonb;cat jsonb;other jsonb;value jsonb;patch jsonb;pid text;iid text;stamp text:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');total numeric;price numeric;recordkey text;batch jsonb:='[]';eventtext text;currentversion bigint;incomplete integer;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 if resource not in ('quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables') then raise exception 'Recurso de comando inválido.';end if;

 if key is not null then
 perform pg_advisory_xact_lock(hashtextextended(company::text||resource||key,0));
 execute format('select data||jsonb_build_object(''id'',id),version from public.%I where company_id=$1 and id=$2 for update',resource) into doc,currentversion using company,key;
 if doc is null then raise exception 'Registro não encontrado.';end if;
 if currentversion is distinct from expected then raise exception 'Registro alterado por outra sessão. Recarregue antes de salvar.' using errcode='40001';end if;
 end if;
 if resource='quotes' then
 if action='create' then
 if key is not null then raise exception 'Criação de cotação não aceita um registro existente.';end if;
 doc:=payload||jsonb_build_object('items',coalesce(payload->'items','[]'::jsonb),'providers',coalesce(payload->'providers','[]'::jsonb),'id',gen_random_uuid()::text,'status','open','offers','{}'::jsonb,'awards','{}'::jsonb,'finalizedProviders','{}'::jsonb);
 else
 if doc->>'status'<>'open' then raise exception 'Esta cotação não está aberta para alterações.';end if;
 iid:=payload->>'itemId';pid:=payload->>'providerId';
 if iid is not null and not exists(select 1 from jsonb_array_elements(doc->'items') v where v->>'id'=iid) then raise exception 'Produto inválido.';end if;
 if iid is not null and exists(select 1 from jsonb_each(coalesce(doc->'finalizedProviders','{}')) f,jsonb_array_elements(f.value->'items') v where v->>'id'=iid) then raise exception 'Produto vinculado a fornecedor finalizado.';end if;
 if pid is not null and (doc->'finalizedProviders') ? pid then raise exception 'Fornecedor já finalizado.';end if;
 if action='setOffer' then
 if not exists(select 1 from jsonb_array_elements(doc->'providers') v where v->>'id'=pid) then raise exception 'Fornecedor inválido.';end if;
 other:=coalesce(doc#>array['offers',iid],'{}');
 if trim(coalesce(payload->>'value',''))='' then other:=other-pid;if doc#>>array['awards',iid]=pid then doc:=jsonb_set(doc,'{awards}',(doc->'awards')-iid);end if;
 else price:=sp_private.decimal_scaled(payload->>'value',2,'Preço');other:=other||jsonb_build_object(pid,price);end if;
 doc:=jsonb_set(doc,array['offers',iid],other,true);
 elsif action='chooseProvider' then
 if pid is null then doc:=jsonb_set(doc,'{awards}',(doc->'awards')-iid);else if doc#>>array['offers',iid,pid] is null then raise exception 'Preencha um preço antes de selecionar.';end if;doc:=jsonb_set(doc,array['awards',iid],to_jsonb(pid),true);end if;
 elsif action='updateItemQuantity' then
 total:=sp_private.decimal_scaled(payload->>'value',3,'Quantidade')/1000;select jsonb_agg(case when v->>'id'=iid then v||jsonb_build_object('quantity',total) else v end) into items from jsonb_array_elements(doc->'items') v;
 doc:=doc||jsonb_build_object('items',items,'awards',(doc->'awards')-iid);
 elsif action='addQuoteProvider' then
 cat:=sp_private.catalog(company,'partners',payload#>>'{provider,id}');
 if exists(select 1 from jsonb_array_elements(doc->'providers') v where v->>'id'=cat->>'id') then raise exception 'Fornecedor já vinculado.';end if;
 doc:=doc||jsonb_build_object('providers',(doc->'providers')||jsonb_build_array(jsonb_build_object('id',cat->>'id','name',cat->>'name')));
 elsif action='removeQuoteProvider' then
 if jsonb_array_length(doc->'providers')<=1 then raise exception 'Mantenha ao menos um fornecedor.';end if;
 if not coalesce((payload->>'clearLinked')::boolean,false) and exists(select 1 from jsonb_array_elements(doc->'items') v where doc#>>array['offers',v->>'id',pid] is not null or doc#>>array['awards',v->>'id']=pid) then raise exception 'Remova os preços e escolhas antes de desvincular.';end if;
 select jsonb_agg(v) into items from jsonb_array_elements(doc->'providers') v where v->>'id'<>pid;doc:=doc||jsonb_build_object('providers',items);
 other:='{}';value:='{}';for item in select * from jsonb_array_elements(doc->'items') loop other:=other||jsonb_build_object(item->>'id',coalesce(doc#>array['offers',item->>'id'],'{}')-pid);if doc#>>array['awards',item->>'id'] is not null and doc#>>array['awards',item->>'id']<>pid then value:=value||jsonb_build_object(item->>'id',doc#>>array['awards',item->>'id']);end if;end loop;doc:=doc||jsonb_build_object('offers',other,'awards',value);
 elsif action='addQuoteItem' then
 cat:=sp_private.catalog(company,'products',coalesce(payload#>>'{product,id}',payload->>'productId'));
 if exists(select 1 from jsonb_array_elements(doc->'items') v where v->>'productId'=cat->>'id') then raise exception 'Este produto já está na cotação.';end if;
 item:=jsonb_build_object('id',gen_random_uuid()::text,'productId',cat->>'id','quantity',sp_private.decimal_scaled(payload->>'quantity',3,'Quantidade')/1000);doc:=doc||jsonb_build_object('items',(doc->'items')||jsonb_build_array(item));
 elsif action in ('finalizeQuoteProvider','finalizeQuote') then
 if jsonb_array_length(doc->'items')=0 or jsonb_array_length(doc->'providers')=0 then raise exception 'Adicione produtos e fornecedores antes de finalizar a cotação.';end if;
 other:=sp_private.quote_computed(doc);value:=coalesce(doc->'finalizedProviders','{}');
 if action='finalizeQuote' and exists(select 1 from jsonb_array_elements(doc->'items') v where doc#>>array['awards',v->>'id'] is null) then raise exception 'Selecione manualmente um fornecedor para cada produto.';end if;
 for item in select * from jsonb_array_elements(other->'awardedByProvider') loop
 if (action='finalizeQuote' or item->>'id'=pid) and jsonb_array_length(item->'items')>0 then value:=value||jsonb_build_object(item->>'id',coalesce(value->(item->>'id'),item||jsonb_build_object('finalizedAt',stamp)));end if;end loop;
 if action='finalizeQuoteProvider' and not value ? pid then raise exception 'Aprove ao menos um produto para o fornecedor.';end if;
 doc:=doc||jsonb_build_object('finalizedProviders',value);if action='finalizeQuote' then doc:=doc||'{"status":"finished"}';end if;
 else raise exception 'Ação de cotação inválida.';end if;end if;
 elsif resource='hortifruti_receipts' then
 if action='create' then doc:=payload||jsonb_build_object('id',gen_random_uuid()::text,'status','pending','weighed',false,'entryConfirmed',false,'history','[]'::jsonb);eventtext:='Compra registrada';
 else
 if doc->>'status'='finished' and action not in ('reopen','setPricing','setPricingBatch','setPrintPeriod') then raise exception 'Reabra a compra para ajustar os dados.';end if;
 if action in ('update','autosave') then
 items:='[]';for item in select * from jsonb_array_elements(coalesce(payload->'items','[]')) loop
 select v into other from jsonb_array_elements(doc->'items') v where v->>'productId'=item->>'productId';
 item:=item||jsonb_build_object('unit',coalesce(item->>'unit',other->>'unit'),'pricing',coalesce(other->'pricing','{"salePriceCents":null,"templateSnapshot":null,"posterQuantity":1,"printLayout":"individual"}'::jsonb));items:=items||jsonb_build_array(item);end loop;
 doc:=doc||payload||jsonb_build_object('items',items,'weighed',false,'entryConfirmed',false);eventtext:='Compra atualizada';
 elsif action='addProducts' then
 items:=doc->'items';for value in select * from jsonb_array_elements(payload->'productIds') loop
 cat:=sp_private.catalog(company,'products',value#>>'{}');if lower(cat->>'category')<>'hortifruti' then raise exception 'Selecione somente produtos da categoria Hortifruti.';end if;
 if exists(select 1 from jsonb_array_elements(items) v where v->>'productId'=cat->>'id') then raise exception 'Produto já selecionado.';end if;
 select data||jsonb_build_object('id',id) into other from public.units where company_id=company and upper(data->>'symbol')='KG';if other is null then raise exception 'Cadastre a unidade KG.';end if;
 items:=items||jsonb_build_array(jsonb_build_object('productId',cat->>'id','name',cat->>'name','photo',cat->>'photo','code',cat->>'code','unit',other->>'id','purchaseUnit',cat->>'unit','basis','total','quantity','','total','','unitCost','','pricing',jsonb_build_object('salePriceCents',null,'templateSnapshot',null,'posterQuantity',1,'printLayout','individual')));end loop;
 doc:=doc||jsonb_build_object('items',items,'weighed',false,'entryConfirmed',false);eventtext:='Produtos adicionados';
 elsif action='removeProduct' then
 select coalesce(jsonb_agg(v),'[]') into items from jsonb_array_elements(doc->'items') v where v->>'productId'<>payload->>'productId';doc:=doc||jsonb_build_object('items',items,'weighed',false,'entryConfirmed',false);eventtext:='Produto removido';
 elsif action in ('setPricing','setPricingBatch') then
 patch:=payload->'patch';if patch ? 'salePriceRaw' then patch:=(patch-'salePriceRaw')||jsonb_build_object('salePriceCents',sp_private.brl_cents(patch->>'salePriceRaw',true));end if;if patch ? 'posterQuantity' then if patch->>'posterQuantity' !~ '^\d+$' then raise exception 'Quantidade de cartazes deve ser inteira.';end if;patch:=patch||jsonb_build_object('posterQuantity',(patch->>'posterQuantity')::integer);end if;items:='[]';for item in select * from jsonb_array_elements(doc->'items') loop
 if action='setPricing' and item->>'productId'=payload->>'productId' or action='setPricingBatch' and (payload->'productIds') ? (item->>'productId') then
 other:=coalesce(item->'pricing','{"salePriceCents":null,"templateSnapshot":null,"posterQuantity":1,"printLayout":"individual"}')||patch;
 if other->>'salePriceCents' is not null and (other->>'salePriceCents')::numeric not between 1 and 999999 or (other->>'posterQuantity')::numeric not between 1 and 100 or trunc((other->>'posterQuantity')::numeric)<>(other->>'posterQuantity')::numeric or other->>'printLayout' not in ('individual','two-a4') then raise exception 'Preço ou configuração de impressão inválidos.';end if;
 if other->'templateSnapshot'<>'null'::jsonb then perform sp_private.validate_template(other->'templateSnapshot');end if;
 item:=item||jsonb_build_object('pricing',other);end if;items:=items||jsonb_build_array(item);end loop;doc:=doc||jsonb_build_object('items',items);eventtext:='Precificação salva';
 elsif action='setPrintPeriod' then
 if coalesce(payload->>'start','')<>'' or coalesce(payload->>'end','')<>'' then if not sp_private.valid_date(payload->>'start') or not sp_private.valid_date(payload->>'end') or payload->>'start'>payload->>'end' then raise exception 'Preencha as duas datas ou deixe ambas vazias.';end if;end if;
 doc:=doc||jsonb_build_object('posterPeriod',payload);eventtext:='Validade atualizada';
 elsif action='finalize' then
 if not coalesce((payload->>'confirmed')::boolean,false) then raise exception 'Confirme a finalização.';end if;
 doc:=doc||jsonb_build_object('status','finished','completedWithPending',coalesce((doc#>>'{computed,summary,incomplete}')::integer,0)>0 or jsonb_array_length(doc->'items')=0);eventtext:='Compra finalizada';
 elsif action='reopen' then
 if not coalesce((payload->>'confirmed')::boolean,false) or doc->>'status'<>'finished' then raise exception 'Confirme a reabertura de uma compra finalizada.';end if;
 doc:=doc||'{"status":"pending","completedWithPending":false}';eventtext:='Compra reaberta';
 elsif action='advance' then
 if jsonb_array_length(doc->'items')=0 or exists(select 1 from jsonb_array_elements(doc->'items') v where v->>'quantityMicros' is null or coalesce((v->>'boxesIncomplete')::boolean,false)) then raise exception 'Informe o peso de todos os produtos.';end if;
 if payload->>'stage'='weighed' then doc:=doc||'{"weighed":true}';eventtext:='Pesagem conferida';
 elsif payload->>'stage' in ('entry','finished') then
 if not (doc->>'weighed')::boolean or (doc#>>'{computed,summary,incomplete}')::integer>0 then raise exception 'Confira peso e custo de todos os produtos.';end if;
 if payload->>'stage'='entry' then doc:=doc||'{"entryConfirmed":true}';eventtext:='Entrada confirmada';else if not (doc->>'entryConfirmed')::boolean then raise exception 'Confirme a entrada.';end if;doc:=doc||'{"status":"finished"}';eventtext:='Compra finalizada';end if;
 else raise exception 'Etapa inválida.';end if;
 else raise exception 'Ação de Hortifruti inválida.';end if;end if;
 doc:=doc||jsonb_build_object('history',coalesce(doc->'history','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'action',eventtext,'responsible',coalesce(payload->>'responsible',''),'at',stamp)));
 elsif resource='supplier_returns' then
 if action='create' then doc:=payload||jsonb_build_object('id',gen_random_uuid()::text,'settlements','[]'::jsonb);
 elsif action='settle' then
 item:=jsonb_build_object('id',gen_random_uuid()::text,'method',payload->>'method','amountCents',sp_private.decimal_scaled(payload->>'amount',2,'Acerto'),'date',payload->>'date','reference',left(coalesce(payload->>'reference',''),200));doc:=doc||jsonb_build_object('settlements',(doc->'settlements')||jsonb_build_array(item));
 else raise exception 'Ação de devolução inválida.';end if;
 elsif resource='butcher_receipts' then
 if action<>'create' then raise exception 'Recebimentos preservam o histórico e não podem ser alterados.';end if;
 doc:=sp_private.butcher_estimate(company,payload)||jsonb_build_object('id',gen_random_uuid()::text,'createdAt',stamp);
 if payload->>'expectedModelId' is not null and payload->>'expectedModelId'<>doc->>'modelId' then raise exception 'Modelo atual alterado. Refaça a estimativa antes de salvar.';end if;
 elsif resource='campaigns' then
 if action='create' then doc:=payload||jsonb_build_object('id',gen_random_uuid()::text,'items','[]'::jsonb,'createdAt',stamp);
 elsif action='update' then doc:=doc||jsonb_build_object('name',payload->>'name','start',payload->>'start','end',payload->>'end','notes',coalesce(payload->>'notes',''));
 elsif action='addItem' then
 cat:=sp_private.catalog(company,'products',payload->>'productId');other:=sp_private.catalog(company,'poster_templates',payload->>'templateId');
 item:=jsonb_build_object('id',gen_random_uuid()::text,'productId',cat->>'id','name',cat->>'name','displayName','','cents',sp_private.brl_cents(payload->>'price'),'unit',payload->>'unit','templateId',other->>'id','templateSnapshot',other,'quantity',1,'printLayout','individual');doc:=doc||jsonb_build_object('items',(doc->'items')||jsonb_build_array(item));
 elsif action='updateItem' then
 patch:=payload->'input';if patch ? 'price' then patch:=patch||jsonb_build_object('cents',sp_private.brl_cents(patch->>'price'));end if;
 if patch ? 'templateId' then patch:=patch||jsonb_build_object('templateSnapshot',sp_private.catalog(company,'poster_templates',patch->>'templateId'));end if;
 patch:=patch-'price'-'id'-'productId'-'name';select jsonb_agg(case when v->>'id'=payload->>'itemId' then v||patch else v end) into items from jsonb_array_elements(doc->'items') v;doc:=doc||jsonb_build_object('items',items);
 elsif action='removeItem' then select coalesce(jsonb_agg(v),'[]') into items from jsonb_array_elements(doc->'items') v where v->>'id'<>payload->>'itemId';doc:=doc||jsonb_build_object('items',items);
 else raise exception 'Ação de campanha inválida.';end if;
 doc:=doc||jsonb_build_object('updatedAt',stamp);
 elsif resource='price_tables' then
 if action='saveDraft' then
 if doc is not null and (doc->>'status'<>'draft' or doc->>'archivedAt' is not null) then raise exception 'Edite somente um rascunho aberto.';end if;
 patch:=coalesce(payload->'input',payload);doc:=coalesce(doc,jsonb_build_object('id',gen_random_uuid()::text,'status','draft','createdAt',stamp,'finalizedAt',null,'archivedAt',null));
 cat:=null;other:=null;if coalesce(patch->>'productId','')<>'' then cat:=sp_private.catalog(company,'products',patch->>'productId');end if;if coalesce(patch->>'templateId','')<>'' then other:=sp_private.catalog(company,'poster_templates',patch->>'templateId');end if;
 doc:=doc||patch||jsonb_build_object('productSnapshot',cat,'templateSnapshot',other,'name',coalesce(cat->>'name',''),'unit',case when cat->>'unit'='KG' or cat->>'unitLabel' like 'KG%' then 'kg' else 'unid' end,'updatedAt',stamp);
 elsif action in ('send','finalize') then
 if jsonb_array_length(coalesce(payload->'keys','[]'))=0 then raise exception 'Selecione pelo menos um item.';end if;
 -- A batch locks all selected rows in stable order before checking their stages.
 perform 1 from public.price_tables where company_id=company and (payload->'keys') ? id order by id for update;
 for recordkey in select jsonb_array_elements_text(payload->'keys') loop
 select data||jsonb_build_object('id',id),version into doc,currentversion from public.price_tables where company_id=company and id=recordkey;
 if currentversion is distinct from (payload#>>array['expectedVersions',recordkey])::bigint then raise exception 'Um dos itens foi alterado. Recarregue a tabela antes de continuar.' using errcode='40001';end if;
 if doc is null or doc->>'archivedAt' is not null or doc->>'status'<>(case when action='send' then 'draft' else 'sent' end) then raise exception 'Um dos itens não está na etapa correta.';end if;
 doc:=doc||jsonb_build_object('status',case when action='send' then 'sent' else 'finalized' end,'updatedAt',stamp)||case when action='send' then jsonb_build_object('sentAt',stamp) else jsonb_build_object('finalizedAt',stamp) end;
 result:=sp_private.persist_record(company,resource,doc,currentversion);batch:=batch||jsonb_build_array(result);
 end loop;return batch;
 elsif action='reopen' then
 if doc->>'status'<>'sent' or doc->>'archivedAt' is not null then raise exception 'Somente itens enviados podem voltar ao rascunho.';end if;
 doc:=doc||jsonb_build_object('status','draft','sentAt',null,'finalizedAt',null,'updatedAt',stamp);
 elsif action='restore' then
 if doc->>'archivedAt' is null then raise exception 'Este item não está arquivado.';end if;
 doc:=doc||jsonb_build_object('archivedAt',null,'restoredAt',stamp,'updatedAt',stamp);
 elsif action='archiveExpired' then
 for doc in select data||jsonb_build_object('id',id,'_version',version) from public.price_tables where company_id=company and data->>'status'='finalized' and data->>'archivedAt' is null and data->>'restoredAt' is null and (data->>'finalizedAt')::timestamptz<=now()-interval '90 days' for update loop
 result:=sp_private.persist_record(company,resource,doc||jsonb_build_object('archivedAt',stamp),(doc->>'_version')::bigint);batch:=batch||jsonb_build_array(result);end loop;return batch;
 else raise exception 'Ação de tabela de preços inválida.';end if;
 end if;
 return sp_private.persist_record(company,resource,doc,expected);
end $$;
notify pgrst,'reload schema';
