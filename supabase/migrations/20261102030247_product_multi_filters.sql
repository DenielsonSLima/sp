-- Multi-select catalog filters. The legacy scalar RPC remains available for older clients.
create function sp_private.product_page_filtered(
  company uuid, requested_page integer, page_size integer, query_text text,
  categories text[], subcategories text[]
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  total integer;
  all_total integer;
  pages integer;
  page integer;
  term text;
begin
  perform sp_private.require_access(company, 'products');
  if requested_page is null or requested_page < 1 or requested_page > 1000000
    or page_size is null or page_size < 1 or page_size > 50
    or length(coalesce(query_text, '')) > 100
    or cardinality(categories) > 500 or cardinality(subcategories) > 500
    or exists (select 1 from unnest(categories) v where v is null or length(v) = 0 or length(v) > 80)
    or exists (select 1 from unnest(subcategories) v where v is null or length(v) = 0 or length(v) > 100)
  then
    raise exception 'Paginação ou filtro de produtos inválido.';
  end if;
  term := sp_private.product_search_text(trim(coalesce(query_text, '')));
  select count(*) into all_total from public.products where company_id = company;
  select count(*) into total from public.products p
  where p.company_id = company
    and (coalesce(cardinality(categories), 0) = 0 or p.metadata->>'category' = any(categories))
    and (coalesce(cardinality(subcategories), 0) = 0 or p.metadata->>'subcategoryId' = any(subcategories))
    and (term = '' or strpos(sp_private.product_search_text(p.metadata->>'name'), term) > 0
      or strpos(sp_private.product_search_text(p.metadata->>'code'), term) > 0);
  pages := greatest(1, ceil(total::numeric / page_size)::integer);
  page := least(requested_page, pages);
  select coalesce(jsonb_agg(item order by created_at, id), '[]'::jsonb) into result from (
    select id, created_at, jsonb_build_object(
      'id', id, 'name', metadata->>'name', 'code', coalesce(metadata->>'code', ''),
      'category', metadata->>'category', 'subcategoryId', metadata->>'subcategoryId',
      'subcategory', metadata->>'subcategory', 'unit', metadata->>'unit',
      'unitLabel', metadata->>'unitLabel', '_version', version, 'hasPhotos', has_photos
    ) item
    from public.products p
    where p.company_id = company
      and (coalesce(cardinality(categories), 0) = 0 or p.metadata->>'category' = any(categories))
      and (coalesce(cardinality(subcategories), 0) = 0 or p.metadata->>'subcategoryId' = any(subcategories))
      and (term = '' or strpos(sp_private.product_search_text(p.metadata->>'name'), term) > 0
        or strpos(sp_private.product_search_text(p.metadata->>'code'), term) > 0)
    order by created_at, id limit page_size offset (page - 1) * page_size
  ) selected;
  return jsonb_build_object(
    'items', result, 'page', page, 'pages', pages, 'perPage', page_size,
    'total', total, 'allTotal', all_total,
    'from', case when total = 0 then 0 else (page - 1) * page_size + 1 end,
    'to', least(page * page_size, total)
  );
end $$;

create function public.sp_product_page_filtered(
  p_company_id uuid, p_page integer default 1, p_per_page integer default 20,
  p_query text default '', p_categories text[] default '{}', p_subcategories text[] default '{}'
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sp_private.product_page_filtered(p_company_id, p_page, p_per_page, p_query, p_categories, p_subcategories)
$$;

revoke all on function sp_private.product_page_filtered(uuid, integer, integer, text, text[], text[]),
  public.sp_product_page_filtered(uuid, integer, integer, text, text[], text[]) from public, anon, authenticated;
grant execute on function sp_private.product_page_filtered(uuid, integer, integer, text, text[], text[]),
  public.sp_product_page_filtered(uuid, integer, integer, text, text[], text[]) to authenticated;
