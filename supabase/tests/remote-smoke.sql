-- Run through the linked management connection. All fixture writes roll back.
do $smoke$
declare company uuid;owner_id uuid;unit_record jsonb;partner jsonb;product jsonb;quote jsonb;priced jsonb;chosen jsonb;finished jsonb;line jsonb;rejected boolean;
begin
 select m.company_id,m.user_id into company,owner_id from public.memberships m join auth.users u on u.id=m.user_id where u.email='denielsonlima201099@gmail.com' and m.role='owner' and m.active;
 if company is null then raise exception 'Administrador inicial não encontrado.';end if;
 begin
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if public.sp_context()->>'companyId' is distinct from company::text then raise exception 'Contexto remoto incorreto.';end if;
  rejected:=false;
  begin execute 'insert into public.units(company_id,id,data) values($1,$2,$3)' using company,'smoke-invalid','{}'::jsonb;exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Gravação direta permitida indevidamente.';end if;
  partner:=public.sp_save(company,'partners','{"id":"smoke-supplier","name":"Verificação transacional","type":"Fornecedor"}',null);
  product:=public.sp_save(company,'products','{"id":"smoke-product","name":"Verificação transacional","category":"Hortifruti","unit":"KG","photos":[]}',null);
  quote:=public.sp_command(company,'quotes','create',null,'{"title":"Verificação transacional","date":"2026-10-30","items":[{"productId":"smoke-product","quantity":"2,5"}],"providers":[{"id":"smoke-supplier"}]}',null);
  priced:=public.sp_command(company,'quotes','setOffer',quote->>'id',jsonb_build_object('itemId',quote#>>'{items,0,id}','providerId','smoke-supplier','value','3,21'),(quote->>'_version')::bigint);
  if (priced#>>'{computed,totals,0,total}')::numeric<>803 then raise exception 'Cálculo de cotação remoto incorreto.';end if;
  chosen:=public.sp_command(company,'quotes','chooseProvider',quote->>'id',jsonb_build_object('itemId',quote#>>'{items,0,id}','providerId','smoke-supplier'),(priced->>'_version')::bigint);
  finished:=public.sp_command(company,'quotes','finalizeQuote',quote->>'id','{}',(chosen->>'_version')::bigint);
  if finished->>'status'<>'finished' then raise exception 'Finalização remota incorreta.';end if;
  line:=public.sp_calculate(company,'hortifruti_line','{"quantity":"2,5","unitCost":"3,2","basis":"unit"}');
  if (line->>'totalCents')::numeric<>800 then raise exception 'Custo remoto incorreto.';end if;
  rejected:=false;
  begin perform public.sp_save(company,'products',product,(product->>'_version')::bigint+1);exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'Versão desatualizada aceita.';end if;
  execute 'set local role anon';rejected:=false;
  begin perform public.sp_context();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'RPC anônima permitida.';end if;
  raise sqlstate 'PT900' using message='Rollback esperado dos dados de verificação';
 exception when sqlstate 'PT900' then null;
 end;
 if exists(select 1 from public.products where company_id=company and id='smoke-product') then raise exception 'A verificação deixou dados no banco.';end if;
end $smoke$;
