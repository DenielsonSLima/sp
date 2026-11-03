create function sp_private.product_photo_snapshot(source jsonb) returns jsonb
 language plpgsql immutable set search_path='' as $$ declare primary_asset jsonb;legacy text;begin
 select a into primary_asset from jsonb_array_elements(coalesce(source->'photoAssets','[]')) a where coalesce((a->>'position')::integer,0)=0 limit 1;
 if primary_asset is not null then return jsonb_build_object('photo','','photoAssets',jsonb_build_array(primary_asset||jsonb_build_object('position',0)));end if;
 legacy:=coalesce(source#>>'{photos,0}',source->>'photo','');if legacy !~ '^data:image/(jpeg|png|webp);base64,' then legacy:='';end if;
 return jsonb_build_object('photo',legacy,'photoAssets','[]'::jsonb);
end $$;
revoke all on function sp_private.product_photo_snapshot(jsonb) from public,anon,authenticated;
create function sp_private.product_photo_is_referenced(object_name text) returns boolean
 language plpgsql stable security definer set search_path='' as $$
 declare parts text[];company uuid;resource text;found_reference boolean;begin
 parts:=string_to_array(object_name,'/');
 if auth.uid() is null or cardinality(parts)<>4 or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 company:=parts[1]::uuid;if not sp_private.allowed(company,'products',false) then return false;end if;
 if exists(select 1 from public.products p,jsonb_array_elements(coalesce(p.data->'photoAssets','[]')) a where p.company_id=company and p.id=parts[3] and a->>'path'=object_name) then return true;end if;
 foreach resource in array array['quotes','hortifruti_receipts','supplier_returns','campaigns','price_tables','flyers'] loop
 execute format('select exists(select 1 from public.%I where company_id=$1 and jsonb_path_exists(data,''$.**.photoAssets[*].path ? (@ == $path)'',$2))',resource) into found_reference using company,jsonb_build_object('path',object_name);
 if found_reference then return true;end if;end loop;return false;
end $$;
revoke all on function sp_private.product_photo_is_referenced(text) from public,anon,authenticated;
-- The bucket itself is created/configured through the Storage API by the importer.
-- Private object names: COMPANY/products/PRODUCT/ASSET.png|jpg|jpeg|webp.
create function sp_private.product_photo_path_access(object_name text,writing boolean default false) returns boolean
 language plpgsql stable security definer set search_path='' as $$
 declare parts text[];company uuid;begin
 if auth.uid() is null then return false;end if;
 parts:=string_to_array(object_name,'/');
 if cardinality(parts)<>4 or parts[2]<>'products' or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or parts[3] !~ '^[A-Za-z0-9_-]{1,100}$' or parts[4] !~ '^[A-Za-z0-9_-]{1,100}\.(png|jpe?g|webp)$' then return false;end if;
 company:=parts[1]::uuid;
 return sp_private.allowed(company,'products',writing) and (exists(select 1 from public.products where company_id=company and id=parts[3]) or not writing and sp_private.product_photo_is_referenced(object_name));
end $$;
create function sp_private.product_photo_unreferenced(object_name text) returns boolean
 language plpgsql stable security definer set search_path='' as $$
 declare parts text[];begin
 if not sp_private.product_photo_path_access(object_name,true) then return false;end if;
 parts:=string_to_array(object_name,'/');
 return not sp_private.product_photo_is_referenced(object_name);
end $$;
revoke all on function sp_private.product_photo_path_access(text,boolean),sp_private.product_photo_unreferenced(text) from public,anon,authenticated;
grant execute on function sp_private.product_photo_path_access(text,boolean),sp_private.product_photo_unreferenced(text) to authenticated;
create policy product_photos_read on storage.objects for select to authenticated
 using(bucket_id='product-photos' and sp_private.product_photo_path_access(name,false));
create policy product_photos_upload on storage.objects for insert to authenticated
 with check(bucket_id='product-photos' and sp_private.product_photo_path_access(name,true));
create policy product_photos_update on storage.objects for update to authenticated
 using(bucket_id='product-photos' and sp_private.product_photo_unreferenced(name))
 with check(bucket_id='product-photos' and sp_private.product_photo_unreferenced(name));
create policy product_photos_delete on storage.objects for delete to authenticated
 using(bucket_id='product-photos' and sp_private.product_photo_unreferenced(name));

create function sp_private.normalize_product_photo_assets(company uuid,product_id text,assets jsonb,legacy_count integer) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb:='[]';asset jsonb;object_metadata jsonb;object_path text;mime text;bytes bigint;position integer;ordinal integer:=0;total integer;paths text[]:=array[]::text[];positions integer[]:=array[]::integer[];width integer;height integer;clean jsonb;begin
 perform sp_private.require_access(company,'products',true);
 if assets is null or jsonb_typeof(assets)<>'array' or legacy_count<0 then raise exception 'Galeria inválida.';end if;
 total:=legacy_count+jsonb_array_length(assets);if total>5 then raise exception 'Cada produto pode ter até 5 fotos.';end if;
 for asset in select * from jsonb_array_elements(assets) loop
 object_path:=asset->>'path';
 if asset->>'bucket' is distinct from 'product-photos' or object_path is null or object_path !~ ('^'||company::text||'/products/'||product_id||'/[A-Za-z0-9_-]{1,100}\.(png|jpe?g|webp)$') then raise exception 'A foto deve pertencer a esta empresa e produto.';end if;
 if object_path=any(paths) then raise exception 'Foto repetida na galeria.';end if;paths:=array_append(paths,object_path);
 select metadata into object_metadata from storage.objects where bucket_id='product-photos' and name=object_path;
 if object_metadata is null or coalesce(object_metadata->>'size','') !~ '^\d+$' then raise exception 'O arquivo da foto não foi encontrado no Storage.';end if;
 mime:=object_metadata->>'mimetype';bytes:=(object_metadata->>'size')::bigint;
 if coalesce(mime,'') not in ('image/png','image/jpeg','image/webp') or bytes<1 or bytes>8388608 then raise exception 'A foto deve ser PNG, JPEG ou WebP de até 8 MB.';end if;
 if (mime='image/png' and object_path !~ '\.png$') or (mime='image/jpeg' and object_path !~ '\.jpe?g$') or (mime='image/webp' and object_path !~ '\.webp$') then raise exception 'A extensão da foto não corresponde ao tipo armazenado.';end if;
 if asset ? 'mimeType' and asset->>'mimeType' is distinct from mime or asset ? 'size' and asset->>'size' is distinct from bytes::text then raise exception 'Os metadados da foto não correspondem ao arquivo.';end if;
 if asset ? 'position' then if jsonb_typeof(asset->'position')<>'number' or asset->>'position' !~ '^\d+$' then raise exception 'Posição da foto inválida.';end if;position:=(asset->>'position')::integer;else position:=ordinal;end if;
 if position<0 or position>=total or position=any(positions) then raise exception 'Posições da galeria inválidas.';end if;positions:=array_append(positions,position);ordinal:=ordinal+1;
 clean:=jsonb_build_object('bucket','product-photos','path',object_path,'mimeType',mime,'size',bytes,'position',position);
 if asset ? 'width' or asset ? 'height' then
 if coalesce(asset->>'width','') !~ '^\d+$' or coalesce(asset->>'height','') !~ '^\d+$' then raise exception 'Dimensões da foto inválidas.';end if;
 width:=(asset->>'width')::integer;height:=(asset->>'height')::integer;
 if width not between 1 and 12000 or height not between 1 and 12000 or width::bigint*height::bigint>40000000 then raise exception 'Dimensões da foto acima do limite.';end if;
 clean:=clean||jsonb_build_object('width',width,'height',height);end if;
 if asset ? 'angle' then if length(asset->>'angle') not between 1 and 60 then raise exception 'Descrição do ângulo inválida.';end if;clean:=clean||jsonb_build_object('angle',asset->>'angle');end if;
 if asset ? 'source' then if asset->>'source' not in ('generated','uploaded','official') then raise exception 'Origem da foto inválida.';end if;clean:=clean||jsonb_build_object('source',asset->>'source');end if;
 result:=result||jsonb_build_array(clean);
 end loop;return result;
end $$;
revoke all on function sp_private.normalize_product_photo_assets(uuid,text,jsonb,integer) from public,anon,authenticated;

create or replace function sp_private.validate_record(company uuid,resource text,input jsonb,old jsonb default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare item jsonb;previous jsonb;items jsonb:='[]';cat jsonb;unit jsonb;parts jsonb:='[]';sumval numeric:=0;amount numeric;quantity numeric;total numeric:=0;settled numeric:=0;key text;value jsonb;family text;required text[];nextversion integer;png bytea;png_width bigint;png_height bigint;begin
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

-- Metadata remains small, while the boolean projection includes Storage-backed photos.
alter table public.products drop column has_photos;
alter table public.products add column has_photos boolean generated always as
 (coalesce(jsonb_array_length(data->'photos'),0)+coalesce(jsonb_array_length(data->'photoAssets'),0)>0) stored;
create or replace function sp_private.product_media(company uuid,keys text[]) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 perform sp_private.require_access(company,'products');
 if keys is null or cardinality(keys)>8 or coalesce(array_ndims(keys),1)<>1 then raise exception 'Solicite fotos de até 8 produtos por vez.';end if;
 if exists(select 1 from unnest(keys) id where id is null or id !~ '^[A-Za-z0-9_-]{1,100}$' or id in ('__proto__','constructor','prototype')) then raise exception 'Identificador de produto inválido.';end if;
 if exists(select 1 from public.products where company_id=company and id=any(keys) and (coalesce(jsonb_array_length(data->'photos'),0)+coalesce(jsonb_array_length(data->'photoAssets'),0)>5)) then raise exception 'Galeria de fotos inválida no catálogo.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'_version',version,'photos',coalesce(data->'photos','[]'::jsonb),'photoAssets',coalesce(data->'photoAssets','[]'::jsonb)) order by array_position(keys,id)),'[]'::jsonb)
 into result from public.products where company_id=company and id=any(keys);return result;
end $$;
create function sp_private.product_gallery(company uuid,product_id text,assets jsonb,legacy_photos jsonb,expected bigint) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare current_record jsonb;current_version bigint;result jsonb;begin
 perform sp_private.require_access(company,'products',true);
 if product_id is null or product_id !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Produto inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text||'products'||product_id,0));
 select data,version into current_record,current_version from public.products where company_id=company and id=product_id for update;
 if current_record is null then raise exception 'Produto não encontrado.';end if;
 if expected is distinct from current_version then raise exception 'O produto foi alterado por outra sessão. Recarregue antes de salvar as fotos.' using errcode='40001';end if;
 if legacy_photos is null or jsonb_typeof(legacy_photos)<>'array' then raise exception 'Galeria legada inválida.';end if;
 result:=sp_private.persist_record(company,'products',current_record||jsonb_build_object('id',product_id,'photos',legacy_photos,'photoAssets',assets),expected);
 return sp_private.read_record(company,'products',product_id);
end $$;
create function public.sp_product_gallery(p_company_id uuid,p_product_id text,p_assets jsonb,p_legacy_photos jsonb,p_expected_version bigint) returns jsonb
 language sql security invoker set search_path='' as $$select sp_private.product_gallery(p_company_id,p_product_id,p_assets,p_legacy_photos,p_expected_version)$$;
revoke all on function sp_private.product_gallery(uuid,text,jsonb,jsonb,bigint),public.sp_product_gallery(uuid,text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function sp_private.product_gallery(uuid,text,jsonb,jsonb,bigint),public.sp_product_gallery(uuid,text,jsonb,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
