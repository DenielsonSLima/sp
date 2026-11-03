
-- One table represents the two levels. Existing category IDs remain unchanged.
drop index public.product_categories_company_name;
create unique index product_categories_company_parent_name on public.product_categories(company_id,coalesce(data->>'parentId',''),lower(data->>'name'));
create index product_categories_company_parent_idx on public.product_categories(company_id,(data->>'parentId'));
create function sp_private.protect_product_category_delete() returns trigger
 language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.product_categories where company_id=old.company_id and data->>'parentId'=old.id) or exists(select 1 from public.products where company_id=old.company_id and data->>'subcategoryId'=old.id) then raise exception 'A categoria ou subcategoria está vinculada a outros cadastros.';end if;
 return old;end $$;
revoke all on function sp_private.protect_product_category_delete() from public,anon,authenticated;
create trigger protect_product_category_delete before delete on public.product_categories for each row execute function sp_private.protect_product_category_delete();

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
 if length(trim(coalesce(input->>'title',''))) not between 1 and 200 or not sp_private.valid_date(input->>'date') or jsonb_array_length(coalesce(input->'items','[]'))=0 or jsonb_array_length(coalesce(input->'providers','[]'))=0 then raise exception 'Preencha título, data, produtos e fornecedores da cotação.';end if;
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


create or replace function sp_private.persist_record(company uuid,resource text,input jsonb,expected bigint default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare key text:=coalesce(nullif(input->>'id',''),gen_random_uuid()::text);old jsonb;currentversion bigint;nextversion bigint;clean jsonb;usr uuid;profilekey text;rol text;source text;target text;row record;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 if resource in ('products','product_categories') then perform pg_advisory_xact_lock(hashtextextended(company::text||':product-taxonomy',0));end if;
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
 if resource='product_categories' and old is not null and old->>'name' is distinct from clean->>'name' and nullif(old->>'parentId','') is null then
 update public.products set data=data||jsonb_build_object('category',clean->>'name'),version=version+1,updated_at=now() where company_id=company and lower(data->>'category')=lower(old->>'name');
 end if;
 if resource='product_categories' and old is not null and old->>'name' is distinct from clean->>'name' and nullif(old->>'parentId','') is not null then
 update public.products set data=data||jsonb_build_object('subcategory',clean->>'name'),version=version+1,updated_at=now() where company_id=company and data->>'subcategoryId'=key;
 end if;
 execute format('insert into public.%I(company_id,id,data,version) values($1,$2,$3,$4) on conflict(company_id,id) do update set data=excluded.data,version=excluded.version,updated_at=now()',resource) using company,key,clean,nextversion;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version) values(company,auth.uid(),resource,key,case when old is null then 'create' else 'update' end,nextversion);
 return clean||jsonb_build_object('id',key,'_version',nextversion);
end $$;


-- Bounded catalog pages contain metadata only. Pictures are requested separately.
create function sp_private.product_search_text(value text) returns text
 language sql immutable set search_path='' as $$
 select translate(lower(coalesce(value,'')),'áàâãäåéèêëíìîïóòôõöúùûüçñ','aaaaaaeeeeiiiiooooouuuucn')
$$;
revoke all on function sp_private.product_search_text(text) from public,anon,authenticated;

create index products_company_created_id_idx on public.products(company_id,created_at,id);
create index products_company_category_created_idx on public.products(company_id,(metadata->>'category'),created_at,id);

create function sp_private.product_page(company uuid,requested_page integer,page_size integer,query_text text,category text,subcategory text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;total integer;all_total integer;pages integer;page integer;term text;begin
 perform sp_private.require_access(company,'products');
 if requested_page is null or requested_page<1 or requested_page>1000000 or page_size is null or page_size<1 or page_size>50 or length(coalesce(query_text,''))>100 or length(coalesce(category,''))>80 or length(coalesce(subcategory,''))>100 then raise exception 'Paginação ou filtro de produtos inválido.';end if;
 term:=sp_private.product_search_text(trim(coalesce(query_text,'')));
 select count(*) into all_total from public.products where company_id=company;
 select count(*) into total from public.products p where p.company_id=company
 and (coalesce(category,'')='' or p.metadata->>'category'=category)
 and (coalesce(subcategory,'')='' or p.metadata->>'subcategoryId'=subcategory)
 and (term='' or strpos(sp_private.product_search_text(p.metadata->>'name'),term)>0 or strpos(sp_private.product_search_text(p.metadata->>'code'),term)>0);
 pages:=greatest(1,ceil(total::numeric/page_size)::integer);page:=least(requested_page,pages);
 select coalesce(jsonb_agg(item order by created_at,id),'[]'::jsonb) into result from (
 select id,created_at,jsonb_build_object('id',id,'name',metadata->>'name','code',coalesce(metadata->>'code',''),'category',metadata->>'category','subcategoryId',metadata->>'subcategoryId','subcategory',metadata->>'subcategory','unit',metadata->>'unit','unitLabel',metadata->>'unitLabel','_version',version,'hasPhotos',has_photos) item
 from public.products p where p.company_id=company
 and (coalesce(category,'')='' or p.metadata->>'category'=category)
 and (coalesce(subcategory,'')='' or p.metadata->>'subcategoryId'=subcategory)
 and (term='' or strpos(sp_private.product_search_text(p.metadata->>'name'),term)>0 or strpos(sp_private.product_search_text(p.metadata->>'code'),term)>0)
 order by created_at,id limit page_size offset (page-1)*page_size) selected;
 return jsonb_build_object('items',result,'page',page,'pages',pages,'perPage',page_size,'total',total,'allTotal',all_total,'from',case when total=0 then 0 else (page-1)*page_size+1 end,'to',least(page*page_size,total));
end $$;
create function public.sp_product_page(p_company_id uuid,p_page integer default 1,p_per_page integer default 20,p_query text default '',p_category text default '',p_subcategory text default '') returns jsonb
 language sql stable security invoker set search_path='' as $$ select sp_private.product_page(p_company_id,p_page,p_per_page,p_query,p_category,p_subcategory) $$;
revoke all on function sp_private.product_page(uuid,integer,integer,text,text,text),public.sp_product_page(uuid,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function sp_private.product_page(uuid,integer,integer,text,text,text),public.sp_product_page(uuid,integer,integer,text,text,text) to authenticated;

create function sp_private.product_previews(company uuid,keys text[]) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.require_access(company,'products');
 if keys is null or cardinality(keys)>25 or coalesce(array_ndims(keys),1)<>1 then raise exception 'Solicite prévias de até 25 produtos por vez.';end if;
 if exists(select 1 from unnest(keys) id where id is null or id !~ '^[A-Za-z0-9_-]{1,100}$' or id in ('__proto__','constructor','prototype')) then raise exception 'Identificador de produto inválido.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'_version',version,'photos',case when snapshot->>'photo'<>'' then jsonb_build_array(snapshot->>'photo') else '[]'::jsonb end,'photoAssets',snapshot->'photoAssets') order by array_position(keys,id)),'[]'::jsonb)
 into result from (select id,version,sp_private.product_photo_snapshot(data) snapshot from public.products where company_id=company and id=any(keys)) selected;
 return result;
end $$;
create function public.sp_product_previews(p_company_id uuid,p_ids text[]) returns jsonb
 language sql stable security invoker set search_path='' as $$ select sp_private.product_previews(p_company_id,p_ids) $$;
revoke all on function sp_private.product_previews(uuid,text[]),public.sp_product_previews(uuid,text[]) from public,anon,authenticated;
grant execute on function sp_private.product_previews(uuid,text[]),public.sp_product_previews(uuid,text[]) to authenticated;
create or replace function sp_private.product_gallery(company uuid,product_id text,assets jsonb,legacy_photos jsonb,expected bigint) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare current_record jsonb;current_version bigint;result jsonb;begin
 perform sp_private.require_access(company,'products',true);
 if product_id is null or product_id !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Produto inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text||':product-taxonomy',0));
 perform pg_advisory_xact_lock(hashtextextended(company::text||'products'||product_id,0));
 select data,version into current_record,current_version from public.products where company_id=company and id=product_id for update;
 if current_record is null then raise exception 'Produto não encontrado.';end if;
 if expected is distinct from current_version then raise exception 'O produto foi alterado por outra sessão. Recarregue antes de salvar as fotos.' using errcode='40001';end if;
 if legacy_photos is null or jsonb_typeof(legacy_photos)<>'array' then raise exception 'Galeria legada inválida.';end if;
 result:=sp_private.persist_record(company,'products',current_record||jsonb_build_object('id',product_id,'photos',legacy_photos,'photoAssets',assets),expected);
 return sp_private.read_record(company,'products',product_id);
end $$;
create or replace function sp_private.delete_record(company uuid,resource text,key text,expected bigint default null) returns boolean language plpgsql security definer set search_path='' as $$
 declare currentversion bigint;ref text;linked boolean;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 if resource in ('products','product_categories') then perform pg_advisory_xact_lock(hashtextextended(company::text||':product-taxonomy',0));end if;
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
create function sp_private.classify_existing_products(company uuid) returns integer
 language plpgsql security definer set search_path='' as $$
 declare product record;parent_id text;subcategory_id text;label text;name_text text;category_text text;changed integer:=0;begin
 perform pg_advisory_xact_lock(hashtextextended(company::text||':product-taxonomy',0));
 for product in select id,data from public.products where company_id=company and coalesce(data->>'subcategoryId','')='' order by id loop
 select id into parent_id from public.product_categories where company_id=company and nullif(data->>'parentId','') is null and data->>'name'=product.data->>'category';
 if parent_id is null then continue;end if;
 name_text:=sp_private.product_search_text(product.data->>'name');category_text:=sp_private.product_search_text(product.data->>'category');
 label:=case category_text
 when 'hortifruti' then case when name_text like '%melancia%' then 'Frutas' when name_text like '%batat%' then 'Tubérculos' else 'Legumes' end
 when 'acougue' then case when name_text ~ 'empanado|steak' then 'Empanados' when name_text ~ 'salsicha|lanche|friella' then 'Embutidos' when name_text ~ 'frango|galinha|asa|coxa|somave' then 'Frangos e aves' else 'Carnes bovinas' end
 when 'bebidas' then case when name_text like '%suco%' then 'Sucos concentrados' else 'Bebidas lácteas' end
 when 'laticinios' then case when name_text like '%condensado%' then 'Leite condensado' when name_text like '%creme de leite%' then 'Creme de leite' when name_text like '%leite em po%' then 'Leite em pó' when name_text like '%manteiga%' then 'Manteigas' when name_text like '%queijo%' then 'Queijos' else 'Leites' end
 when 'mercearia' then case when name_text like '%mucilon%' then 'Cereais infantis' when name_text ~ 'biscoito|wafer|torrada|cream cracker' then 'Biscoitos e torradas' when name_text ~ 'instantaneo|lamen' then 'Macarrão instantâneo' when name_text ~ 'macarrao|espaguete' then 'Massas secas' when name_text like '%leite de coco%' then 'Leite de coco' when name_text ~ 'cafe|nescafe' then 'Cafés' when name_text like '%acucar%' then 'Açúcares' when name_text ~ 'arroz|feijao' then 'Arroz e feijão' when name_text ~ 'flocao|farinha' then 'Flocos e farinhas' when name_text like '%ovos%' then 'Ovos' else 'Outros alimentos' end
 else 'Geral' end;
 select id into subcategory_id from public.product_categories where company_id=company and data->>'parentId'=parent_id and lower(data->>'name')=lower(label);
 if subcategory_id is null then
 subcategory_id:=gen_random_uuid()::text;
 insert into public.product_categories(company_id,id,data) values(company,subcategory_id,jsonb_build_object('id',subcategory_id,'name',label,'parentId',parent_id));
 end if;
 update public.products set data=data||jsonb_build_object('subcategoryId',subcategory_id,'subcategory',label),version=version+1,updated_at=now() where company_id=company and id=product.id;
 changed:=changed+1;
 end loop;
 if changed>0 then insert into public.audit_log(company_id,resource,record_id,action,details) values(company,'products','taxonomy-v1','classify',jsonb_build_object('origin','product-server-pagination-v1','products',changed));end if;
 return changed;
end $$;
revoke all on function sp_private.classify_existing_products(uuid) from public,anon,authenticated;
do $$ declare company uuid;begin
 for company in select distinct c.id from public.companies c join public.memberships m on m.company_id=c.id and m.role='owner' join auth.users u on u.id=m.user_id where c.name='Supermercado do Povo' and lower(u.email)='denielsonlima201099@gmail.com' loop
 perform sp_private.classify_existing_products(company);
 end loop;
end $$;
notify pgrst,'reload schema';
