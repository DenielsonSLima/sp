-- Reuse image bytes only from this document's explicitly checked revision.
-- The existing full-snapshot RPC remains compatible with open editor tabs.
create or replace function sp_private.save_flyer_delta(
 company uuid, input jsonb, expected bigint, image_refs jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
 previous jsonb;
 current_version bigint;
 record_key text := input->>'id';
 item jsonb;
 source_value jsonb;
 target_index integer;
 source_index integer;
 field_name text;
 source_field text;
 path text[];
 seen text[] := array[]::text[];
 i integer;
begin
 perform sp_private.require_access(company,'flyers',true);
 if coalesce(jsonb_typeof(input),'null') <> 'object' or record_key is null
    or coalesce(jsonb_typeof(input->'elements'),'null') <> 'array'
    or coalesce(jsonb_typeof(image_refs),'null') <> 'array' then
  raise exception 'Referências de imagens inválidas.';
 end if;
 if jsonb_array_length(input->'elements') > 200 or jsonb_array_length(image_refs) > 400 then
  raise exception 'Referências de imagens inválidas.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text||'flyers'||record_key,0));
 select data,version into previous,current_version from public.flyers
 where company_id=company and id=record_key for update;
 if current_version is null then
  raise exception 'Registro removido por outra sessão.' using errcode='40001';
 end if;
 if expected is distinct from current_version then
  raise exception 'Este registro foi alterado em outra sessão. Recarregue antes de salvar.' using errcode='40001';
 end if;
 for i in 0..jsonb_array_length(image_refs)-1 loop
  item := image_refs->i;
  if coalesce(jsonb_typeof(item),'null') <> 'object'
     or coalesce(item->>'target','') !~ '^(0|[1-9][0-9]{0,2})$'
     or coalesce(item->>'source','') !~ '^(0|[1-9][0-9]{0,2})$'
     or coalesce(item->>'field','') not in ('src','image')
     or coalesce(item->>'sourceField','') not in ('src','image') then
   raise exception 'Referências de imagens inválidas.';
  end if;
  target_index := (item->>'target')::integer;
  source_index := (item->>'source')::integer;
  field_name := item->>'field'; source_field := item->>'sourceField';
  path := array['elements',target_index::text,field_name];
  if target_index >= jsonb_array_length(input->'elements')
     or source_index >= jsonb_array_length(previous->'elements')
     or jsonb_typeof(input->'elements'->target_index) <> 'object'
     or coalesce(input#>>path,'') <> ''
     or (target_index::text||':'||field_name)=any(seen) then
   raise exception 'Referências de imagens inválidas.';
  end if;
  source_value := previous->'elements'->source_index->source_field;
  if coalesce(jsonb_typeof(source_value),'null') <> 'string' or source_value = '""'::jsonb then
   raise exception 'Imagem original indisponível nesta revisão.';
  end if;
  input := jsonb_set(input,path,source_value,true);
  seen := array_append(seen,target_index::text||':'||field_name);
 end loop;
 -- Reentrant lock and version check; canonical validation, audit and Realtime
 -- are exactly the same as the full-snapshot save, in this transaction.
 return sp_private.save_flyer(company,input,expected);
end $function$;
revoke all on function sp_private.save_flyer_delta(uuid,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function sp_private.save_flyer_delta(uuid,jsonb,bigint,jsonb) to authenticated;
create or replace function public.sp_flyer_save_delta(
 p_company_id uuid,p_record jsonb,p_expected_version bigint,p_image_refs jsonb
) returns jsonb language sql set search_path = '' as $function$
 select sp_private.save_flyer_delta(p_company_id,p_record,p_expected_version,p_image_refs)
$function$;
revoke all on function public.sp_flyer_save_delta(uuid,jsonb,bigint,jsonb) from public,anon;
grant execute on function public.sp_flyer_save_delta(uuid,jsonb,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
