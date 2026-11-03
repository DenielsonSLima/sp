-- Supermercado do Povo: isolated company access, RPC-only writes and Realtime.
create schema if not exists sp_private;
revoke all on schema sp_private from public, anon;
grant usage on schema sp_private to authenticated;
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 created_at timestamptz not null default now()
);
create table public.memberships (
 company_id uuid not null references public.companies(id), user_id uuid not null references auth.users(id),
 role text not null default 'member' check(role in ('owner','admin','member')),
 profile_id text, display_name text not null default '', active boolean not null default true,
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,user_id)
);
create index memberships_user_company on public.memberships(user_id,company_id) where active;
create table public.audit_log (
 id bigint generated always as identity primary key,company_id uuid not null references public.companies(id),
 actor_id uuid references auth.users(id),resource text not null,record_id text not null,action text not null,
 version bigint,created_at timestamptz not null default now()
);
create index audit_log_company_created on public.audit_log(company_id,created_at desc);
do $ddl$ declare resource text; begin
 foreach resource in array array['units','partners','products','profiles','company_settings','watermarks','headers','brand_assets','brand_categories','poster_templates','butcher_models','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','calendar_events','flyers','home_notices'] loop
 execute format('create table public.%I (company_id uuid not null references public.companies(id),id text not null check(id ~ ''^[A-Za-z0-9_-]{1,100}$'' and id not in (''__proto__'',''constructor'',''prototype'')),data jsonb not null check(jsonb_typeof(data)=''object''),version bigint not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,id))',resource);
 execute format('create index %I on public.%I(company_id,updated_at desc,id)',resource||'_company_updated',resource);
 end loop;
end $ddl$;
create unique index units_company_symbol on public.units(company_id,upper(data->>'symbol'));
create unique index products_company_code on public.products(company_id,lower(data->>'code')) where coalesce(data->>'code','')<>'';
create unique index profiles_company_name on public.profiles(company_id,lower(data->>'name'));
create unique index categories_company_name on public.brand_categories(company_id,lower(data->>'name'));
create unique index returns_company_supplier_number on public.supplier_returns(company_id,(data#>>'{supplier,id}'),lower(data->>'number'));
alter table public.units add constraint units_fields check(length(data->>'symbol') between 1 and 8 and length(data->>'name') between 1 and 60);
alter table public.partners add constraint partners_fields check(length(data->>'name') between 1 and 100 and data->>'type' in ('Fornecedor','Cliente','Ambos','Outro'));
alter table public.products add constraint products_fields check(length(data->>'name') between 1 and 100 and length(data->>'unit')>0 and jsonb_typeof(data->'photos')='array');
alter table public.profiles add constraint profiles_fields check(length(data->>'name') between 1 and 80 and jsonb_typeof(data->'modules')='array');

create function sp_private.module_for(resource text) returns text language sql immutable set search_path='' as $$
 select case when resource in ('units','partners','products','brand_assets','brand_categories','poster_templates','butcher_models') then 'cadastros'
 when resource in ('profiles','user_access','company_settings','watermarks','headers') then 'configuracoes'
 when resource='quotes' then 'cotacao' when resource='hortifruti_receipts' then 'hortifruti'
 when resource='butcher_receipts' then 'acougue' when resource='supplier_returns' then 'devolucoes'
 when resource='campaigns' then 'promocoes' when resource='price_tables' then 'tabela-precos'
 when resource='calendar_events' then 'calendario' when resource='flyers' then 'encartes' when resource='home_notices' then 'inicio' end
$$;
create function sp_private.allowed(company uuid,resource text,writing boolean default false) returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.memberships m left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id
 where m.company_id=company and m.user_id=auth.uid() and m.active
 and (m.role in ('owner','admin') or (
 sp_private.module_for(resource) is not null and not (writing and sp_private.module_for(resource)='configuracoes')
 and (resource in ('units','partners','products','poster_templates','brand_assets','brand_categories','company_settings','watermarks','headers') and not writing
 or coalesce(p.data->'modules','[]'::jsonb) ? sp_private.module_for(resource)))))
$$;
create function sp_private.require_access(company uuid,resource text,writing boolean default false) returns void
 language plpgsql stable security invoker set search_path='' as $$ begin
 if auth.uid() is null or not sp_private.allowed(company,resource,writing) then raise exception 'Acesso não autorizado para este módulo.' using errcode='42501';end if;
end $$;
create function sp_private.assert_resource(resource text) returns void language plpgsql immutable set search_path='' as $$ begin
 if resource is null or not resource=any(array['units','partners','products','profiles','company_settings','watermarks','headers','brand_assets','brand_categories','poster_templates','butcher_models','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','calendar_events','flyers','home_notices','user_access']) then raise exception 'Recurso inválido.';end if;
end $$;
create function sp_private.read_record(company uuid,resource text,key text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin
 perform sp_private.assert_resource(resource); perform sp_private.require_access(company,resource);
 if resource='user_access' then
 select jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'profile',p.data->>'name','profileId',m.profile_id,'role',m.role,'active',m.active,'_version',m.version) into result
 from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id where m.company_id=company and m.user_id::text=key;
 else execute format('select data||jsonb_build_object(''id'',id,''_version'',version) from public.%I where company_id=$1 and id=$2',resource) into result using company,key;end if;
 return result;
end $$;
create function sp_private.list_records(company uuid,resource text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource);
 if resource='user_access' then select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'profile',p.data->>'name','profileId',m.profile_id,'role',m.role,'active',m.active,'_version',m.version) order by m.created_at),'[]'::jsonb) into result from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id where m.company_id=company;
 else execute format('select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by created_at,id),''[]''::jsonb) from public.%I where company_id=$1',resource) into result using company;end if;return result;
end $$;

create function sp_private.decimal_scaled(raw text,places integer,label text,optional boolean default false) returns numeric
 language plpgsql immutable set search_path='' as $$ declare n numeric;begin
 raw:=replace(trim(coalesce(raw,'')),',','.');if strpos(raw,'.')>0 then raw:=rtrim(rtrim(raw,'0'),'.');end if;if raw='' and optional then return null;end if;
 if raw !~ ('^\d+(\.\d{1,'||places||'})?$') then raise exception '%: informe um número positivo com até % casas decimais.',label,places;end if;
 n:=raw::numeric*power(10::numeric,places);if n<=0 or n>1000000*power(10::numeric,places) then raise exception '%: valor fora do limite.',label;end if;return n;
end $$;
create function sp_private.brl_cents(raw text,optional boolean default false) returns numeric language plpgsql immutable set search_path='' as $$ declare normalized text;value numeric;begin
 normalized:=regexp_replace(regexp_replace(trim(coalesce(raw,'')),'^R\$[[:space:]]*','','i'),'[[:space:]]','','g');
 if normalized='' and optional then return null;end if;
 if strpos(normalized,',')>0 then
 if normalized !~ '^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$' then raise exception 'Informe um valor em reais com até duas casas decimais.';end if;normalized:=replace(replace(normalized,'.',''),',','.');
 elsif normalized ~ '^\d{1,3}(\.\d{3})+$' then normalized:=replace(normalized,'.','');end if;
 value:=sp_private.decimal_scaled(normalized,2,'Preço',optional);if value>999999 then raise exception 'Use um valor de até R$ 9.999,99.';end if;return value;
end $$;
create function sp_private.valid_date(raw text) returns boolean language plpgsql immutable set search_path='' as $$ declare d date;begin
 if raw is null or raw !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;d:=raw::date;return to_char(d,'YYYY-MM-DD')=raw;
 exception when others then return false;end $$;
create function sp_private.catalog(company uuid,resource text,key text) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin
 if auth.uid() is null or not exists(select 1 from public.memberships where company_id=company and user_id=auth.uid() and active) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if resource not in ('products','units','partners','poster_templates','butcher_models','profiles') then raise exception 'Catálogo inválido.';end if;
 execute format('select data||jsonb_build_object(''id'',id) from public.%I where company_id=$1 and id=$2',resource) into result using company,key;
 if result is null then raise exception 'Registro de % não encontrado: %.',resource,key;end if;return result;
end $$;

create function sp_private.horti_line(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
 declare qty numeric;cost numeric;total numeric;boxes jsonb:='[]';box jsonb;value numeric;prev numeric;incomplete boolean:=false;mode text:=coalesce(input->>'weighMode','total');basis text:=coalesce(input->>'basis','total');cnt integer;begin
 if mode not in ('total','boxes') or basis not in ('unit','total') then raise exception 'Modo de pesagem ou cálculo inválido.';end if;
 if mode='boxes' then
 prev:=sp_private.decimal_scaled(input->>'previousWeight',6,'Peso anterior',true);qty:=coalesce(prev,0);
 for box in select * from jsonb_array_elements(coalesce(input->'boxes','[]')) loop value:=sp_private.decimal_scaled(box#>>'{}',6,'Peso da caixa',true);if value is null then incomplete:=true;end if;boxes:=boxes||jsonb_build_array(value);qty:=qty+coalesce(value,0);end loop;
 incomplete:=incomplete or (jsonb_array_length(boxes)=0 and prev is null);qty:=nullif(qty,0);
 else qty:=sp_private.decimal_scaled(input->>'quantity',6,'Quantidade',true);end if;
 if qty>1000000000000 then raise exception 'Peso total acima do limite.';end if;
 if basis='total' then total:=sp_private.decimal_scaled(input->>'total',2,'Total',true);if qty is not null and total is not null then cost:=round(total*10000000000/qty);end if;
 else cost:=sp_private.decimal_scaled(input->>'unitCost',6,'Custo unitário',true);if qty is not null and cost is not null then total:=round(qty*cost/10000000000);end if;end if;
 if total is not null and total<1 then raise exception 'O total deve ser de pelo menos R$ 0,01.';end if;
 if coalesce(input->>'unitCount','')<>'' then if input->>'unitCount' !~ '^\d+$' then raise exception 'Contagem deve ser inteira.';end if;cnt:=(input->>'unitCount')::integer;if cnt<1 or cnt>1000000 then raise exception 'Contagem fora do limite.';end if;end if;
 return jsonb_build_object('quantityMicros',qty,'unitMicros',cost,'totalCents',total,'unitCount',cnt,'basis',basis,'weighMode',mode,'boxes',boxes,'boxesIncomplete',incomplete,'previousWeightMicros',prev,'inactiveBoxesRaw',case when mode='total' then coalesce(input->'boxes','[]') end,'inactivePreviousWeightRaw',case when mode='total' then coalesce(input->>'previousWeight','') end);
end $$;
create function sp_private.quote_computed(q jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
 declare totals jsonb:='[]';awarded jsonb:='[]';comparisons jsonb:='{}';line_totals jsonb:='{}';provider jsonb;item jsonb;prices jsonb;lines jsonb;minimum_total numeric;lowest_count integer;ptot numeric;selected numeric:=0;minprice numeric;price numeric;lt numeric;complete boolean;lowest jsonb;counted integer;begin
 for provider in select * from jsonb_array_elements(q->'providers') loop
 ptot:=0;complete:=true;lines:='[]';
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
create function sp_private.butcher_estimate(company uuid,input jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare model jsonb;weight numeric:=0;animal jsonb;animals jsonb:='[]';rows jsonb:='[]';allocations jsonb;row jsonb;grams numeric;animal_count integer;mode text:=coalesce(input->>'weightMode','total');received text:=coalesce(input->>'receivedDate',current_date::text);counted numeric;begin
 perform sp_private.require_access(company,'butcher_receipts');
 select data||jsonb_build_object('id',id) into model from public.butcher_models where company_id=company and lower(data->>'category')=lower(input->>'category') and (data->>'current')::boolean and (data->>'active')::boolean;
 if model is null then raise exception 'Defina um modelo atual e ativo para esta categoria.';end if;
 if not sp_private.valid_date(received) then raise exception 'Data de recebimento inválida.';end if;
 if coalesce(input->>'animalCount','1') !~ '^\d+$' then raise exception 'Quantidade de animais deve ser inteira.';end if;
 animal_count:=coalesce(input->>'animalCount','1')::integer;if animal_count<1 or animal_count>1000 then raise exception 'Use entre 1 e 1.000 animais.';end if;
 if mode='individual' then
 if jsonb_array_length(coalesce(input->'animals','[]'))<>animal_count then raise exception 'A quantidade deve corresponder aos pesos individuais.';end if;
 for animal in select * from jsonb_array_elements(input->'animals') loop grams:=sp_private.decimal_scaled(animal->>'weight',3,'Peso do animal');weight:=weight+grams;animals:=animals||jsonb_build_array(jsonb_build_object('identification',left(coalesce(animal->>'identification',''),80),'weightGrams',grams));end loop;
 elsif mode='total' then weight:=sp_private.decimal_scaled(input->>'weight',3,'Peso do lote');else raise exception 'Modo de pesagem inválido.';end if;
 if weight>100000000 then raise exception 'Peso total máximo de 100.000 kg.';end if;
 with parts as (
 select p,ord::integer idx,(p->>'percentBps')::numeric bps from jsonb_array_elements(model->'parts') with ordinality a(p,ord) where coalesce((p->>'active')::boolean,true)
 union all select null,10001,10000-(model->>'totalBps')::numeric
 ), raw as(select *,floor(weight*bps/10000) base,mod(weight*bps,10000) rem from parts), ranked as(select *,row_number() over(order by rem desc,idx) rank,weight-sum(base) over() rest from raw)
 select jsonb_agg(jsonb_build_object('part',p,'grams',base+case when rank<=rest then 1 else 0 end) order by idx) into allocations from ranked;
 for row in select * from jsonb_array_elements(allocations) loop
 if row->'part'='null'::jsonb then grams:=(row->>'grams')::numeric;else
 counted:=null;if row#>>'{part,unit}'='UN' and coalesce(input#>>array['quantities',row#>>'{part,id}'],'')<>'' then
 if input#>>array['quantities',row#>>'{part,id}'] !~ '^\d+$' then raise exception 'Quantidade da parte deve ser inteira.';end if;
 counted:=(input#>>array['quantities',row#>>'{part,id}'])::numeric;if counted>1000000 then raise exception 'Quantidade fora do limite.';end if;end if;
 rows:=rows||jsonb_build_array((row->'part')||jsonb_build_object('estimatedGrams',(row->>'grams')::numeric,'quantity',counted));end if;
 end loop;
 return jsonb_build_object('animalCount',animal_count,'weightMode',mode,'animals',animals,'receivedDate',received,'category',model->>'category','modelId',model->>'id','modelName',model->>'name','modelVersion',model->'version','weightGrams',weight,'totalBps',model->'totalBps','rows',rows,'unallocatedGrams',grams,'reference',left(coalesce(input->>'reference',''),80));
end $$;

create function sp_private.validate_template(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$ declare field text;el jsonb;required text;begin
 if input is null or jsonb_typeof(input)<>'object' then raise exception 'Modelo inválido.';end if;
 foreach required in array array['id','name','color','background','font','scale','widthMm','heightMm','layout'] loop if not input ? required or input->required='null'::jsonb then raise exception 'Campo obrigatório do modelo: %.',required;end if;end loop;
 if length(trim(input->>'name')) not between 1 and 60 or input->>'color' !~ '^#[0-9a-fA-F]{6}$' or input->>'background' !~ '^#[0-9a-fA-F]{6}$' or not (input->>'font'=any(array['Arial','Verdana','Georgia','Impact','Trebuchet MS'])) then raise exception 'Nome, cores ou fonte do modelo inválidos.';end if;
 if (input->>'scale')::numeric not between .8 and 1.15 or (input->>'widthMm')::numeric not between 60 and 420 or (input->>'heightMm')::numeric not between 80 and 594 or (input->>'heightMm')::numeric<=(input->>'widthMm')::numeric then raise exception 'Dimensões do cartaz inválidas.';end if;
 foreach field in array array['headline','product','price','validity'] loop
 el:=input#>array['layout',field];foreach required in array array['x','y','w','h','fontSize','fontFamily','align'] loop if el is null or not el ? required or el->required='null'::jsonb then raise exception 'Elemento do modelo incompleto: %.',field;end if;end loop;if el is null or (el->>'x')::numeric<0 or (el->>'y')::numeric<0 or (el->>'w')::numeric<.08 or (el->>'h')::numeric<.035 or (el->>'x')::numeric+(el->>'w')::numeric>1.000001 or (el->>'y')::numeric+(el->>'h')::numeric>1.000001 or (el->>'fontSize')::numeric not between 1.5 and 55 then raise exception 'Mantenha os elementos dentro da folha e confira as fontes.';end if;
 if el->>'align' not in ('left','center','right') or el->>'fontFamily' not in ('Arial','Verdana','Georgia','Impact','Trebuchet MS') then raise exception 'Fonte ou alinhamento inválido.';end if;
 end loop;
 return input;
end $$;
create function sp_private.validate_record(company uuid,resource text,input jsonb,old jsonb default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare item jsonb;items jsonb:='[]';cat jsonb;unit jsonb;parts jsonb:='[]';sumval numeric:=0;amount numeric;quantity numeric;total numeric:=0;settled numeric:=0;key text;value jsonb;family text;required text[];nextversion integer;png bytea;png_width bigint;png_height bigint;begin
 perform sp_private.require_access(company,resource,true);
 if jsonb_typeof(input)<>'object' then raise exception 'Registro inválido.';end if;
 input:=input-'_version'-'computed'-'action';if octet_length(input::text)>26214400 then raise exception 'Registro excede o limite de 25 MB.';end if;
 required:=case resource
 when 'units' then array['name','symbol'] when 'partners' then array['name','type'] when 'products' then array['name','unit']
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
 elsif resource='products' then
 if length(trim(coalesce(input->>'name',''))) not between 1 and 100 or length(coalesce(input->>'code',''))>40 then raise exception 'Nome ou código de produto inválido.';end if;
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
create function sp_private.persist_record(company uuid,resource text,input jsonb,expected bigint default null) returns jsonb
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
 execute format('insert into public.%I(company_id,id,data,version) values($1,$2,$3,$4) on conflict(company_id,id) do update set data=excluded.data,version=excluded.version,updated_at=now()',resource) using company,key,clean,nextversion;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version) values(company,auth.uid(),resource,key,case when old is null then 'create' else 'update' end,nextversion);
 return clean||jsonb_build_object('id',key,'_version',nextversion);
end $$;
create function sp_private.delete_record(company uuid,resource text,key text,expected bigint default null) returns boolean language plpgsql security definer set search_path='' as $$
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
 if resource='profiles' and exists(select 1 from public.memberships where company_id=company and profile_id=key) then raise exception 'O perfil está vinculado a usuários.';end if;
 if resource='brand_categories' and exists(select 1 from public.brand_assets where company_id=company and data->>'category'=(select data->>'name' from public.brand_categories where company_id=company and id=key)) then raise exception 'Mova os elementos antes de remover a categoria.';end if;
 execute format('delete from public.%I where company_id=$1 and id=$2',resource) using company,key;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version) values(company,auth.uid(),resource,key,'delete',currentversion);return true;
end $$;
create function sp_private.command(company uuid,resource text,action text,key text default null,payload jsonb default '{}',expected bigint default null) returns jsonb
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
 if action='create' then doc:=payload||jsonb_build_object('id',gen_random_uuid()::text,'status','open','offers','{}'::jsonb,'awards','{}'::jsonb,'finalizedProviders','{}'::jsonb);
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
-- Public persistence entry rejects business-document writes unconditionally.
-- Commands alone can call persist_record, whose EXECUTE is never granted to clients.
create function sp_private.save_record(company uuid,resource text,input jsonb,expected bigint default null) returns jsonb
 language plpgsql security definer set search_path='' as $$ begin
 perform sp_private.assert_resource(resource);perform sp_private.require_access(company,resource,true);
 if resource in ('quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables') then raise exception 'Use a operação de negócio deste módulo.';end if;
 return sp_private.persist_record(company,resource,input,expected);
end $$;
create function sp_private.calculate(company uuid,kind text,input jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;item jsonb;items jsonb:='[]';quantity numeric;price numeric;total numeric:=0;begin
 if kind in ('hortifruti_line','hortifruti') then perform sp_private.require_access(company,'hortifruti_receipts');return sp_private.horti_line(input);
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
create function sp_private.context() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare companies jsonb;begin
 if auth.uid() is null then raise exception 'Entre na sua conta para continuar.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',m.role,'profileId',m.profile_id,'modules',case when m.role in ('owner','admin') then '["inicio","cadastros","cotacao","hortifruti","acougue","devolucoes","encartes","promocoes","tabela-precos","calendario","configuracoes"]'::jsonb else coalesce(p.data->'modules','[]'::jsonb) end) order by c.created_at),'[]') into companies
 from public.memberships m join public.companies c on c.id=m.company_id left join public.profiles p on p.company_id=m.company_id and p.id=m.profile_id where m.user_id=auth.uid() and m.active;
 return jsonb_build_object('user',jsonb_build_object('id',auth.uid(),'email',(select email from auth.users where id=auth.uid())),'companies',companies,'companyId',companies#>>'{0,id}');
end $$;

-- Public API functions are invokers; privileged implementation remains in the unexposed schema.
create function public.sp_context() returns jsonb language sql stable security invoker set search_path='' as $$select sp_private.context()$$;
create function public.sp_list(p_company_id uuid,p_resource text) returns jsonb language sql stable security invoker set search_path='' as $$select sp_private.list_records(p_company_id,p_resource)$$;
create function public.sp_get(p_company_id uuid,p_resource text,p_id text) returns jsonb language sql stable security invoker set search_path='' as $$select sp_private.read_record(p_company_id,p_resource,p_id)$$;
create function public.sp_save(p_company_id uuid,p_resource text,p_record jsonb,p_expected_version bigint default null) returns jsonb language sql security invoker set search_path='' as $$select sp_private.save_record(p_company_id,p_resource,p_record,p_expected_version)$$;
create function public.sp_delete(p_company_id uuid,p_resource text,p_id text,p_expected_version bigint default null) returns boolean language sql security invoker set search_path='' as $$select sp_private.delete_record(p_company_id,p_resource,p_id,p_expected_version)$$;
create function public.sp_command(p_company_id uuid,p_resource text,p_action text,p_id text default null,p_payload jsonb default '{}',p_expected_version bigint default null) returns jsonb language sql security invoker set search_path='' as $$select sp_private.command(p_company_id,p_resource,p_action,p_id,p_payload,p_expected_version)$$;
create function public.sp_calculate(p_company_id uuid,p_kind text,p_input jsonb default '{}') returns jsonb language sql stable security invoker set search_path='' as $$select sp_private.calculate(p_company_id,p_kind,p_input)$$;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;
create policy companies_read on public.companies for select to authenticated using(sp_private.allowed(id,'home_notices'));
create policy memberships_read on public.memberships for select to authenticated using(user_id=(select auth.uid()) or sp_private.allowed(company_id,'user_access'));
create policy audit_read on public.audit_log for select to authenticated using(sp_private.allowed(company_id,'user_access',true));
revoke all on public.companies,public.memberships,public.audit_log from anon,authenticated;
grant select on public.companies,public.memberships,public.audit_log to authenticated;
do $policies$ declare resource text;begin
 foreach resource in array array['units','partners','products','profiles','company_settings','watermarks','headers','brand_assets','brand_categories','poster_templates','butcher_models','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','calendar_events','flyers','home_notices'] loop
 execute format('alter table public.%I enable row level security',resource);
 execute format('revoke all on public.%I from anon,authenticated',resource);
 execute format('grant select on public.%I to authenticated',resource);
 execute format('create policy company_module_read on public.%I for select to authenticated using(sp_private.allowed(company_id,%L))',resource,resource);
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=resource) then execute format('alter publication supabase_realtime add table public.%I',resource);end if;
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='memberships') then alter publication supabase_realtime add table public.memberships;end if;
end $policies$;
revoke all on all functions in schema sp_private from public,anon,authenticated;
grant execute on function sp_private.allowed(uuid,text,boolean),sp_private.context(),sp_private.list_records(uuid,text),sp_private.read_record(uuid,text,text),sp_private.save_record(uuid,text,jsonb,bigint),sp_private.delete_record(uuid,text,text,bigint),sp_private.command(uuid,text,text,text,jsonb,bigint),sp_private.calculate(uuid,text,jsonb) to authenticated;
revoke all on function public.sp_context(),public.sp_list(uuid,text),public.sp_get(uuid,text,text),public.sp_save(uuid,text,jsonb,bigint),public.sp_delete(uuid,text,text,bigint),public.sp_command(uuid,text,text,text,jsonb,bigint),public.sp_calculate(uuid,text,jsonb) from public,anon;
grant execute on function public.sp_context(),public.sp_list(uuid,text),public.sp_get(uuid,text,text),public.sp_save(uuid,text,jsonb,bigint),public.sp_delete(uuid,text,text,bigint),public.sp_command(uuid,text,text,text,jsonb,bigint),public.sp_calculate(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Administrative bootstrap: never callable by application users or the REST API.
create function sp_private.bootstrap_company(p_owner_email text,p_company_name text default 'Supermercado do Povo') returns uuid
 language plpgsql security invoker set search_path='' as $$
 declare owner_id uuid;company uuid;entry jsonb;category text;template jsonb;layout jsonb;dimensions jsonb;begin
 select id into owner_id from auth.users where lower(email)=lower(trim(p_owner_email));
 if owner_id is null then raise exception 'Crie primeiro a conta no Supabase Auth para este e-mail.';end if;
 select c.id into company from public.companies c join public.memberships m on m.company_id=c.id where m.user_id=owner_id and m.role='owner' and c.name=p_company_name;
 if company is not null then return company;end if;
 insert into public.companies(name) values(p_company_name) returning id into company;
 insert into public.profiles(company_id,id,data) values
 (company,'administrator',jsonb_build_object('name','Administrador','modules','["inicio","cadastros","cotacao","hortifruti","acougue","devolucoes","encartes","promocoes","tabela-precos","calendario","configuracoes"]'::jsonb)),
 (company,'operator',jsonb_build_object('name','Operador','modules','["inicio","cadastros","cotacao","hortifruti","acougue","devolucoes","encartes","promocoes","tabela-precos","calendario"]'::jsonb));
 insert into public.memberships(company_id,user_id,role,profile_id,display_name) values(company,owner_id,'owner','administrator','Administrador');
 for entry in select * from jsonb_array_elements('[{"id":"UN","symbol":"UN","name":"Unidade"},{"id":"KG","symbol":"KG","name":"Quilograma"},{"id":"G","symbol":"G","name":"Gramas"},{"id":"PCT","symbol":"PCT","name":"Pacote"},{"id":"CX","symbol":"CX","name":"Caixa"},{"id":"L","symbol":"L","name":"Litro"}]') loop insert into public.units(company_id,id,data) values(company,entry->>'id',entry);end loop;
 insert into public.company_settings(company_id,id,data) values(company,'default',jsonb_build_object('name',p_company_name,'legalName','','document','','email',p_owner_email,'phone','','address',''));
 insert into public.watermarks(company_id,id,data) values(company,'default',jsonb_build_object('text',p_company_name,'opacity',15,'size',34,'rotation',-25,'type','text','image',''));
 insert into public.headers(company_id,id,data) values(company,'default',jsonb_build_object('title',p_company_name,'subtitle','Onde o povo faz economia','showLogo',true,'showContact',true,'alignment','left'));
 foreach category in array array['Supermercado do Povo','Cabeçalho','Marca d’água','Formas','Logos','Mascotes','Selos','Molduras','Fundos','Outros','Sem categoria'] loop insert into public.brand_categories(company_id,id,data) values(company,gen_random_uuid()::text,jsonb_build_object('name',category));end loop;
 layout:='{"headline":{"x":0.05,"y":0.02,"w":0.9,"h":0.1,"fontSize":4,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0.1,"lineHeight":1.1},"product":{"x":0.04,"y":0.17,"w":0.92,"h":0.25,"fontSize":8.5,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1.08},"price":{"x":0.04,"y":0.43,"w":0.92,"h":0.36,"fontSize":29,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1},"validity":{"x":0.04,"y":0.86,"w":0.92,"h":0.1,"fontSize":2.5,"fontFamily":"Arial","align":"center","hidden":false,"letterSpacing":0,"lineHeight":1.4}}';
 for dimensions in select * from jsonb_array_elements('[{"id":"small","name":"Pequeno","widthMm":105,"heightMm":148},{"id":"medium","name":"Médio","widthMm":148,"heightMm":210},{"id":"large","name":"Grande","widthMm":210,"heightMm":297}]') loop
 template:=dimensions||jsonb_build_object('headline','OFERTA','productText','{{produto}}','color','#c51d2b','background','#ffffff','font','Arial','scale',1,'layout',layout);insert into public.poster_templates(company_id,id,data) values(company,dimensions->>'id',template);end loop;
 return company;
end $$;
revoke all on function sp_private.bootstrap_company(text,text) from public,anon,authenticated;

-- Company-scoped invalidation avoids relying on unfilterable DELETE payloads.
create table public.resource_changes (
 company_id uuid not null references public.companies(id),resource text not null,
 revision bigint not null default 1,updated_at timestamptz not null default now(),
 primary key(company_id,resource),check(sp_private.module_for(resource) is not null)
);
alter table public.resource_changes enable row level security;
revoke all on public.resource_changes from public,anon,authenticated;
grant select on public.resource_changes to authenticated;
create policy resource_changes_read on public.resource_changes for select to authenticated using(sp_private.allowed(company_id,resource));
create function sp_private.track_resource_change() returns trigger language plpgsql security definer set search_path='' as $$
 declare company uuid;changed_resource text;begin
 company:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 changed_resource:=case when tg_table_name='memberships' then 'user_access' else tg_table_name end;
 if sp_private.module_for(changed_resource) is null then raise exception 'Recurso de sinalização inválido.';end if;
 insert into public.resource_changes(company_id,resource,revision,updated_at) values(company,changed_resource,1,clock_timestamp())
 on conflict(company_id,resource) do update set revision=resource_changes.revision+1,updated_at=excluded.updated_at;
 return null;
end $$;
create function sp_private.notify_profile_members() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if old.data is distinct from new.data then
 update public.memberships set version=version+1,updated_at=clock_timestamp() where company_id=new.company_id and profile_id=new.id;
 end if;return null;
end $$;
revoke all on function sp_private.track_resource_change(),sp_private.notify_profile_members() from public,anon,authenticated;
do $signals$ declare resource text;begin
 foreach resource in array array['units','partners','products','profiles','company_settings','watermarks','headers','brand_assets','brand_categories','poster_templates','butcher_models','quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables','calendar_events','flyers','home_notices','memberships'] loop
 execute format('create trigger signal_resource_change after insert or update or delete on public.%I for each row execute function sp_private.track_resource_change()',resource);
 if resource<>'memberships' and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=resource) then execute format('alter publication supabase_realtime drop table public.%I',resource);end if;
 end loop;
 create trigger signal_profile_permissions after update on public.profiles for each row execute function sp_private.notify_profile_members();
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes') then alter publication supabase_realtime add table public.resource_changes;end if;
end $signals$;
notify pgrst,'reload schema';
