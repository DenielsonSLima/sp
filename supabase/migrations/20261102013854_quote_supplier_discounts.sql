-- Discounts affect approved items and supplier totals; quoted proposals remain gross.
create or replace function sp_private.quote_gross_computed(q jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
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

create or replace function sp_private.quote_discount_amount(base numeric, spec jsonb)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare amount numeric;
begin
  if spec is null or spec='null'::jsonb then return 0; end if;
  if jsonb_typeof(spec) is distinct from 'object' or coalesce(spec->>'type','') not in ('amount','percent')
    or jsonb_typeof(spec->'value') is distinct from 'number' then raise exception 'Desconto inválido.'; end if;
  amount := (spec->>'value')::numeric;
  if amount <> trunc(amount) or amount < 0 or amount > 100000000000000 then raise exception 'Desconto fora do limite.'; end if;
  if spec->>'type'='percent' then
    if amount > 10000 then raise exception 'O desconto não pode ultrapassar 100%%.'; end if;
    amount := round(base * amount / 10000);
  end if;
  if amount > base then raise exception 'O desconto não pode superar o total dos produtos aprovados.'; end if;
  return amount;
end $$;

create or replace function sp_private.quote_computed(q jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  result jsonb := sp_private.quote_gross_computed(q);
  groups jsonb := '[]'; grp jsonb; lines jsonb; item jsonb; spec jsonb;
  gross numeric; line_discount numeric; item_discounts numeric; subtotal numeric;
  general_discount numeric; selected numeric := 0;
begin
  for grp in select * from jsonb_array_elements(result->'awardedByProvider') loop
    -- A finalized supplier is an immutable commercial snapshot.
    if coalesce(q->'finalizedProviders','{}') ? (grp->>'id') then
      grp := q->'finalizedProviders'->(grp->>'id');
    else
      gross := 0; item_discounts := 0; lines := '[]';
      for item in select * from jsonb_array_elements(grp->'items') loop
        spec := q#>array['itemDiscounts',item->>'id',grp->>'id'];
        line_discount := sp_private.quote_discount_amount((item->>'total')::numeric,spec);
        gross := gross + (item->>'total')::numeric;
        item_discounts := item_discounts + line_discount;
        lines := lines || jsonb_build_array(item || jsonb_build_object(
          'grossTotal',(item->>'total')::numeric,'discount',spec,'discountTotal',line_discount,
          'total',(item->>'total')::numeric-line_discount));
      end loop;
      subtotal := gross - item_discounts;
      spec := q#>array['providerDiscounts',grp->>'id'];
      -- An award may be temporarily removed while negotiating; retain its discount without
      -- applying it to an empty supplier group. Revalidate once products are awarded again.
      general_discount := case when jsonb_array_length(lines)>0 then sp_private.quote_discount_amount(subtotal,spec) else 0 end;
      grp := grp || jsonb_build_object('items',lines,'grossTotal',gross,'itemDiscountTotal',item_discounts,
        'subtotal',subtotal,'discount',spec,'discountTotal',general_discount,'total',subtotal-general_discount);
    end if;
    groups := groups || jsonb_build_array(grp);
    selected := selected + (grp->>'total')::numeric;
  end loop;
  return result || jsonb_build_object('discountsSupported',true,'grossSelectedTotal',result->'selectedTotal',
    'selectedTotal',selected,'awardedByProvider',groups);
end $$;

create or replace function sp_private.set_quote_discount(company uuid, key text, payload jsonb, expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc jsonb; currentversion bigint; pid text:=payload->>'providerId'; iid text:=payload->>'itemId';
  spec jsonb; amount numeric; discount_type text:=payload->>'type'; raw text:=trim(coalesce(payload->>'value',''));
  entries jsonb; result jsonb;
begin
  perform sp_private.require_access(company,'quotes',true);
  perform pg_advisory_xact_lock(hashtextextended(company::text||'quotes'||key,0));
  select data||jsonb_build_object('id',id),version into doc,currentversion
    from public.quotes where company_id=company and id=key for update;
  if doc is null then raise exception 'Cotação não encontrada.'; end if;
  if currentversion is distinct from expected then
    raise exception 'Registro alterado por outra sessão. Recarregue antes de salvar.' using errcode='40001';
  end if;
  if doc->>'status'<>'open' then raise exception 'Esta cotação não está aberta para alterações.'; end if;
  if not exists(select 1 from jsonb_array_elements(doc->'providers') p where p->>'id'=pid) then
    raise exception 'Fornecedor inválido.';
  end if;
  if coalesce(doc->'finalizedProviders','{}') ? pid then raise exception 'Fornecedor já finalizado.'; end if;
  if iid is not null then
    if doc#>>array['awards',iid] is distinct from pid then raise exception 'Escolha este fornecedor para o produto antes de informar o desconto.'; end if;
    if exists(select 1 from jsonb_each(coalesce(doc->'finalizedProviders','{}')) p,
      jsonb_array_elements(p.value->'items') i where i->>'id'=iid) then raise exception 'Produto já finalizado.'; end if;
  elsif not exists(select 1 from jsonb_each_text(doc->'awards') a where a.value=pid) then
    raise exception 'Aprove ao menos um produto para o fornecedor.';
  end if;
  if discount_type is null or discount_type not in ('amount','percent') then raise exception 'Tipo de desconto inválido.'; end if;
  if raw='' or raw ~ '^0+([,.]0{1,2})?$' then spec:=null;
  else
    amount:=sp_private.decimal_scaled(raw,2,'Desconto');
    spec:=jsonb_build_object('type',discount_type,'value',amount);
  end if;
  if iid is null then
    entries:=coalesce(doc->'providerDiscounts','{}');
    entries:=case when spec is null then entries-pid else entries||jsonb_build_object(pid,spec) end;
    doc:=doc||jsonb_build_object('providerDiscounts',entries);
  else
    entries:=coalesce(doc#>array['itemDiscounts',iid],'{}');
    entries:=case when spec is null then entries-pid else entries||jsonb_build_object(pid,spec) end;
    doc:=doc||jsonb_build_object('itemDiscounts',coalesce(doc->'itemDiscounts','{}')||jsonb_build_object(iid,entries));
  end if;
  -- Calculation validates discount ceilings; persist_record repeats authorization/version checks,
  -- canonicalizes catalog references and emits the existing audit and resource_changes signals.
  perform sp_private.quote_computed(doc);
  result:=sp_private.persist_record(company,'quotes',doc,expected);
  return result;
end $$;

create or replace function public.sp_command(p_company_id uuid,p_resource text,p_action text,p_id text default null,
  p_payload jsonb default '{}',p_expected_version bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_resource='quotes' and p_action='setQuoteDiscount' then
    return sp_private.set_quote_discount(p_company_id,p_id,p_payload,p_expected_version);
  end if;
  return sp_private.command(p_company_id,p_resource,p_action,p_id,p_payload,p_expected_version);
end $$;

revoke all on function sp_private.quote_gross_computed(jsonb),sp_private.quote_discount_amount(numeric,jsonb),
  sp_private.set_quote_discount(uuid,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function sp_private.set_quote_discount(uuid,text,jsonb,bigint) to authenticated;
revoke all on function public.sp_command(uuid,text,text,text,jsonb,bigint) from public,anon;
grant execute on function public.sp_command(uuid,text,text,text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
