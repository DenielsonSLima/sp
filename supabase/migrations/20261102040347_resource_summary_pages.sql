-- Small stored projections keep list reads away from document snapshots and image bytes.
create function sp_private.resource_summary(resource text, source jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; categories jsonb; names jsonb; search text;
begin
  select coalesce(jsonb_agg(name order by name),'[]') into categories from
    (select distinct item->>'category' name from jsonb_array_elements(coalesce(source->'items','[]')) item
     where coalesce(item->>'category','') <> '') chosen;
  select coalesce(jsonb_agg(item->>'name' order by position),'[]') into names
    from jsonb_array_elements(coalesce(source->'items','[]')) with ordinality items(item,position)
    where position <= 3;
  search := concat_ws(' ',source->>'title',source->>'name',source->>'reference',source->>'category',
    source->>'modelName',source->>'number',source->>'originalInvoice',source->>'reason',source->>'notes',
    source#>>'{partner,name}',source#>>'{supplier,name}',source#>>'{productSnapshot,code}',
    source#>>'{productSnapshot,name}',source#>>'{templateSnapshot,name}',
    (select string_agg(provider->>'name',' ') from jsonb_array_elements(coalesce(source->'providers','[]')) provider),
    (select string_agg(concat_ws(' ',item->>'name',item->>'code',item->>'category'),' ')
     from jsonb_array_elements(coalesce(source->'items','[]')) item));
  if resource = 'quotes' then
    result := jsonb_build_object('title',source->'title','date',source->'date','status',source->'status',
      'itemCount',jsonb_array_length(coalesce(source->'items','[]')),
      'providerCount',jsonb_array_length(coalesce(source->'providers','[]')),
      'selectedCount',(select count(*) from jsonb_each(coalesce(source->'awards','{}'))),
      'categories',categories);
  elsif resource = 'hortifruti_receipts' then
    result := jsonb_build_object('date',source->'date','status',source->'status',
      'partner',jsonb_build_object('name',source#>'{partner,name}'),
      'itemCount',jsonb_array_length(coalesce(source->'items','[]')),'itemNames',names,
      'entryConfirmed',source->'entryConfirmed','weighed',source->'weighed','summary',source#>'{computed,summary}');
  elsif resource = 'butcher_receipts' then
    select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(source)
      where key = any(array['category','reference','receivedDate','weightGrams','animalCount','modelName','modelVersion','totalBps']);
    result := result || jsonb_build_object('rowCount',jsonb_array_length(coalesce(source->'rows','[]')),
      'date',source->'receivedDate');
  elsif resource = 'supplier_returns' then
    result := jsonb_build_object('number',source->'number','originalInvoice',source->'originalInvoice','date',source->'date',
      'supplier',jsonb_build_object('name',source#>'{supplier,name}'),'itemCount',jsonb_array_length(coalesce(source->'items','[]')),
      'totals',source#>'{computed,totals}','status',source#>'{computed,totals,status}');
  elsif resource = 'campaigns' then
    result := jsonb_build_object('name',source->'name','start',source->'start','end',source->'end',
      'notes',source->'notes','status',coalesce(source->'status','"active"'),
      'itemCount',jsonb_array_length(coalesce(source->'items','[]')),'date',source->'start');
  elsif resource = 'price_tables' then
    select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(source)
      where key = any(array['status','name','cents','quantity','start','end','finalizedAt','archivedAt','restoredAt']);
    result := result || jsonb_build_object('productCode',source#>'{productSnapshot,code}',
      'templateName',source#>'{templateSnapshot,name}','date',source->'start');
  else raise exception 'Recurso sem resumo.';
  end if;
  return result || jsonb_build_object('_search',sp_private.product_search_text(search));
end $$;
revoke all on function sp_private.resource_summary(text,jsonb) from public,anon,authenticated;

do $$ declare resource text; begin
  foreach resource in array array['quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables'] loop
    execute format('alter table public.%I add column list_summary jsonb generated always as (sp_private.resource_summary(%L,data)) stored',resource,resource);
    execute format('create index %I on public.%I(company_id,created_at desc,id)',resource||'_summary_page_idx',resource);
    execute format('create index %I on public.%I(company_id,(list_summary->>''status''),(list_summary->>''date''),id)',resource||'_summary_filter_idx',resource);
  end loop;
end $$;

create function sp_private.resource_page(company uuid, resource text, requested_page integer, page_size integer,
  query_text text, status_filter text, start_date text, end_date text, category_filter text, archived_filter text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; counts jsonb; categories jsonb := '[]'; total integer; all_total integer;
  page integer; pages integer; term text; archive_predicate text; predicates text;
begin
  if resource is null or resource not in ('quotes','hortifruti_receipts','butcher_receipts','supplier_returns','campaigns','price_tables') then
    raise exception 'Recurso sem paginação operacional.';
  end if;
  perform sp_private.require_access(company,resource);
  if requested_page is null or requested_page not between 1 and 1000000 or page_size is null or page_size not between 1 and 50
     or length(coalesce(query_text,''))>200 or length(coalesce(status_filter,''))>40
     or length(coalesce(category_filter,''))>100 or archived_filter is null or archived_filter not in ('active','archived','all') then
    raise exception 'Paginação ou filtro inválido.';
  end if;
  if (coalesce(start_date,'')<>'' and not sp_private.valid_date(start_date))
     or (coalesce(end_date,'')<>'' and not sp_private.valid_date(end_date))
     or (coalesce(start_date,'')<>'' and coalesce(end_date,'')<>'' and start_date>end_date) then
    raise exception 'Período inválido.';
  end if;
  term := sp_private.product_search_text(trim(coalesce(query_text,'')));
  archive_predicate := case when resource <> 'price_tables' or archived_filter='all' then 'true'
    when archived_filter='archived' then 'list_summary->>''archivedAt'' is not null'
    else 'list_summary->>''archivedAt'' is null' end;
  execute format('select count(*) from public.%I where company_id=$1 and %s',resource,archive_predicate) into all_total using company;
  execute format('select coalesce(jsonb_object_agg(status,n),''{}'') from (select coalesce(list_summary->>''status'',''unknown'') status,count(*) n from public.%I where company_id=$1 and %s group by 1) stats',resource,archive_predicate)
    into counts using company;
  if resource='quotes' then
    select coalesce(jsonb_agg(category order by category),'[]') into categories from
      (select distinct jsonb_array_elements_text(list_summary->'categories') category from public.quotes where company_id=company) chosen;
  end if;
  predicates := 'company_id=$1 and '||archive_predicate||
    ' and ($2='''' or strpos(coalesce(list_summary->>''_search'','''')||'' ''||id,$2)>0)'||
    case when resource='hortifruti_receipts' then
      ' and ($3='''' or ($3=''pending'' and coalesce(list_summary->>''status'','''')<>''finished'') or list_summary->>''status''=$3)'
    else ' and ($3='''' or list_summary->>''status''=$3)' end||
    ' and ($4='''' or coalesce(list_summary->>''end'',list_summary->>''date'','''') >= $4)'||
    ' and ($5='''' or coalesce(list_summary->>''start'',list_summary->>''date'','''') <= $5)'||
    ' and ($6='''' or list_summary->>''category''=$6 or (list_summary->''categories'') ? $6)';
  execute format('select count(*) from public.%I where %s',resource,predicates) into total
    using company,term,coalesce(status_filter,''),coalesce(start_date,''),coalesce(end_date,''),coalesce(category_filter,'');
  pages := greatest(1,ceil(total::numeric/page_size)::integer); page := least(requested_page,pages);
  execute format('select coalesce(jsonb_agg(item order by created_at desc,id),''[]'') from
    (select id,created_at,(list_summary-''_search'')||jsonb_build_object(''id'',id,''_version'',version) item
     from public.%I where %s order by created_at desc,id limit $7 offset $8) selected',resource,predicates) into result
    using company,term,coalesce(status_filter,''),coalesce(start_date,''),coalesce(end_date,''),coalesce(category_filter,''),page_size,(page-1)*page_size;
  return jsonb_build_object('items',result,'page',page,'pages',pages,'perPage',page_size,'total',total,'allTotal',all_total,
    'from',case when total=0 then 0 else (page-1)*page_size+1 end,'to',least(page*page_size,total),
    'counts',counts,'facets',jsonb_build_object('categories',categories,'statusCounts',counts));
end $$;
create function public.sp_resource_page(p_company_id uuid,p_resource text,p_page integer default 1,p_per_page integer default 20,
  p_query text default '',p_status text default '',p_start text default '',p_end text default '',p_category text default '',p_archived text default 'active') returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sp_private.resource_page(p_company_id,p_resource,p_page,p_per_page,p_query,p_status,p_start,p_end,p_category,p_archived)
$$;

create function sp_private.campaign_calendar(company uuid,start_date text,end_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform sp_private.require_access(company,'campaigns');
  if not sp_private.valid_date(start_date) or not sp_private.valid_date(end_date)
     or start_date>end_date or end_date::date-start_date::date>366 then raise exception 'Período do calendário inválido.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'_version',version,'name',list_summary->'name',
    'start',list_summary->'start','end',list_summary->'end','notes',list_summary->'notes') order by list_summary->>'start',id),'[]')
    into result from public.campaigns where company_id=company and list_summary->>'start'<=end_date and list_summary->>'end'>=start_date;
  return result;
end $$;
create function public.sp_campaign_calendar(p_company_id uuid,p_start text,p_end text) returns jsonb
language sql stable security invoker set search_path = '' as $$select sp_private.campaign_calendar(p_company_id,p_start,p_end)$$;

revoke all on function sp_private.resource_page(uuid,text,integer,integer,text,text,text,text,text,text),
  public.sp_resource_page(uuid,text,integer,integer,text,text,text,text,text,text),
  sp_private.campaign_calendar(uuid,text,text),public.sp_campaign_calendar(uuid,text,text) from public,anon,authenticated;
grant execute on function sp_private.resource_page(uuid,text,integer,integer,text,text,text,text,text,text),
  public.sp_resource_page(uuid,text,integer,integer,text,text,text,text,text,text),
  sp_private.campaign_calendar(uuid,text,text),public.sp_campaign_calendar(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
