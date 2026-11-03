begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','05f7c1f7-f2cc-4b12-b56e-89cddb221847',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$declare company uuid:='89d1d8c9-b03d-46aa-a743-deac900f93b3';saved jsonb;loaded jsonb;blocked boolean:=false;before_count integer;begin
 select count(*) into before_count from public.partners where company_id=company;
 if public.sp_partner_cnpj(company,'00.000.000/0001-91')<>'00000000000191' or public.sp_partner_cnpj(company,'12.ABC.345/01DE-35')<>'12ABC34501DE35' then raise exception 'Falha de validação do CNPJ.';end if;
 saved:=public.sp_save(company,'partners',jsonb_build_object('name','Verificação transacional de parceiro','type','Fornecedor','cnpj','12ABC34501DE35','legalName','Razão social de verificação','tradeName','Verificação','street','Rua de verificação','number','120','district','Centro','city','Aracaju','state','SE','postalCode','49000-001','complement','Sala 3'),null);
 loaded:=public.sp_get(company,'partners',saved->>'id');
 if loaded->>'legalName'<>'Razão social de verificação' or loaded->>'street'<>'Rua de verificação' or loaded->>'number'<>'120' or loaded->>'state'<>'SE' or loaded->>'postalCode'<>'49000001' then raise exception 'Campos cadastrais não persistiram.';end if;
 begin perform public.sp_save(company,'partners',jsonb_build_object('name','Duplicado','type','Fornecedor','cnpj','12ABC34501DE35'),null);exception when raise_exception then if sqlerrm like 'Já existe um parceiro%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'CNPJ duplicado aceito.';end if;
 saved:=public.sp_save(company,'partners',jsonb_build_object('id',saved->>'id','name','Nome revisado','type','Fornecedor','number','121'),(saved->>'_version')::bigint);
 if saved->>'legalName'<>'Razão social de verificação' or saved->>'city'<>'Aracaju' or saved->>'number'<>'121' then raise exception 'Atualização parcial perdeu dados.';end if;
 perform set_config('sp.partner_company_verification',jsonb_build_object('project','enhoierfwuwtzulznjxa','cnpj_validation',true,'alphanumeric_cnpj',true,'address_and_legal_name_persisted',true,'duplicate_cnpj_blocked',blocked,'partial_update_preserves_fields',true,'partners_before',before_count,'rolled_back',true)::text,true);
end $$;
select current_setting('sp.partner_company_verification')::jsonb verification;
rollback;
