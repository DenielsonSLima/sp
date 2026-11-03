begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','05f7c1f7-f2cc-4b12-b56e-89cddb221847',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$declare company uuid:='89d1d8c9-b03d-46aa-a743-deac900f93b3';q jsonb;loaded jsonb;blocked boolean:=false;before_count integer;begin
 select count(*) into before_count from public.quotes where company_id=company;
 q:=public.sp_command(company,'quotes','create',null,jsonb_build_object('title','Verificação transacional de cabeçalho','date','2026-10-31','notes','Esta verificação usa rollback.'),null);
 if q->>'status'<>'open' or jsonb_array_length(q->'items')<>0 or jsonb_array_length(q->'providers')<>0 or q#>>'{computed,selectedTotal}'<>'0' then raise exception 'Cabeçalho inválido.';end if;
 loaded:=public.sp_get(company,'quotes',q->>'id');if loaded->>'notes'<>'Esta verificação usa rollback.' then raise exception 'Observação não persistiu.';end if;
 begin perform public.sp_command(company,'quotes','finalizeQuote',q->>'id','{}',(q->>'_version')::bigint);exception when raise_exception then if sqlerrm like 'Adicione produtos e fornecedores%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Cotação vazia foi finalizada.';end if;
 perform set_config('sp.quote_header_verification',jsonb_build_object('project','enhoierfwuwtzulznjxa','header_created',true,'notes_persisted',true,'items',jsonb_array_length(q->'items'),'providers',jsonb_array_length(q->'providers'),'selected_total',q#>'{computed,selectedTotal}','empty_finalization_blocked',blocked,'quotes_before',before_count,'rolled_back',true)::text,true);
end $$;
select current_setting('sp.quote_header_verification')::jsonb verification;
rollback;
