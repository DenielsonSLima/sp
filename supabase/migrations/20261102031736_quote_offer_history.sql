-- Unit prices from earlier quotations, matched by stable product/supplier/unit IDs.
-- Same-day quotations are ordered by creation time and ID; future/current quotations never participate.
create index quotes_history_order_idx on public.quotes
  (company_id, (data->>'date') desc, created_at desc, id desc);

create function sp_private.quote_with_price_history(company uuid, doc jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare created timestamptz; history jsonb;
begin
  perform sp_private.require_access(company, 'quotes');
  if doc is null then return null; end if;
  select created_at into created from public.quotes where company_id=company and id=doc->>'id';
  if not found then raise exception 'Cotação não encontrada.'; end if;
  with pairs as (
    select item->>'id' as item_id, item->>'productId' as product_id, item->>'unit' as unit,
      provider->>'id' as provider_id
    from jsonb_array_elements(doc->'items') item cross join jsonb_array_elements(doc->'providers') provider
  ), previous as (
    select pair.*, prior.* from pairs pair cross join lateral (
      select q.id as quote_id, q.data->>'date' as quoted_on,
        (q.data#>>array['offers',i->>'id',pair.provider_id])::numeric as cents
      from public.quotes q cross join lateral jsonb_array_elements(q.data->'items') i
      where q.company_id=company and q.id<>doc->>'id'
        and ((q.data->>'date'),q.created_at,q.id) < ((doc->>'date'),created,(doc->>'id'))
        and i->>'productId'=pair.product_id and i->>'unit'=pair.unit
        and q.data->'providers' @> jsonb_build_array(jsonb_build_object('id',pair.provider_id))
        and jsonb_typeof(q.data#>array['offers',i->>'id',pair.provider_id])='number'
        and (q.data#>>array['offers',i->>'id',pair.provider_id])::numeric > 0
      order by q.data->>'date' desc,q.created_at desc,q.id desc limit 1
    ) prior
  ), grouped as (
    select item_id, jsonb_object_agg(provider_id,jsonb_build_object(
      'previousCents',cents,'quotedOn',quoted_on,'quoteId',quote_id,
      'trend',case
        when doc#>>array['offers',item_id,provider_id] is null then 'none'
        when (doc#>>array['offers',item_id,provider_id])::numeric > cents then 'up'
        when (doc#>>array['offers',item_id,provider_id])::numeric < cents then 'down'
        else 'equal' end
    )) as suppliers from previous group by item_id
  ) select coalesce(jsonb_object_agg(item_id,suppliers),'{}'::jsonb) into history from grouped;
  return jsonb_set(doc,'{computed}',coalesce(doc->'computed','{}'::jsonb)||jsonb_build_object('priceHistory',history));
end $$;
revoke all on function sp_private.quote_with_price_history(uuid,jsonb) from public,anon,authenticated;
grant execute on function sp_private.quote_with_price_history(uuid,jsonb) to authenticated;

-- Preserve generic contracts. Attach history only to quote detail/mutation responses,
-- never to every record in the list and never persist it in the business document.
create or replace function public.sp_get(p_company_id uuid,p_resource text,p_id text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  result:=sp_private.read_record(p_company_id,p_resource,p_id);
  if p_resource='quotes' and result is not null then
    return sp_private.quote_with_price_history(p_company_id,result);
  end if;
  return result;
end $$;

create or replace function public.sp_command(p_company_id uuid,p_resource text,p_action text,p_id text default null,
  p_payload jsonb default '{}',p_expected_version bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_resource='quotes' and p_action='setQuoteDiscount' then
    result:=sp_private.set_quote_discount(p_company_id,p_id,p_payload,p_expected_version);
  else
    result:=sp_private.command(p_company_id,p_resource,p_action,p_id,p_payload,p_expected_version);
  end if;
  if p_resource='quotes' and result ? 'id' then
    return sp_private.quote_with_price_history(p_company_id,result);
  end if;
  return result;
end $$;
revoke all on function public.sp_get(uuid,text,text), public.sp_command(uuid,text,text,text,jsonb,bigint) from public,anon;
grant execute on function public.sp_get(uuid,text,text), public.sp_command(uuid,text,text,text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
