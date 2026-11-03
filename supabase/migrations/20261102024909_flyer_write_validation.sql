-- Validate large flyer snapshots without materializing every image in a tuplestore.
-- Keep the generic validator intact for every other resource and its public API.
create or replace function sp_private.validate_flyer_record(input jsonb)
returns jsonb language plpgsql set search_path = '' as $function$
declare
 clean jsonb;
 elements jsonb;
 item jsonb;
 source text;
 source_key text;
 item_index integer;
 canvas_width numeric;
 canvas_height numeric;
begin
 if input is null or jsonb_typeof(input) <> 'object' then
  raise exception 'Registro inválido.';
 end if;
 clean := input - array['_version','computed','action'];
 if octet_length(clean::text) > 26214400 then
  raise exception 'Registro excede o limite de 25 MB.';
 end if;
 canvas_width := (clean->>'width')::numeric;
 canvas_height := (clean->>'height')::numeric;
 elements := clean->'elements';
 if canvas_width is null or canvas_height is null
    or canvas_width not between 320 and 4096 or canvas_height not between 320 and 4096
    or canvas_width * canvas_height > 16000000
    or coalesce(jsonb_typeof(elements),'null') <> 'array' then
  raise exception 'Dimensões ou elementos da arte inválidos.';
 end if;
 if jsonb_array_length(elements) > 200 then
  raise exception 'Dimensões ou elementos da arte inválidos.';
 end if;
 for item_index in 0..jsonb_array_length(elements)-1 loop
  item := elements->item_index;
  if jsonb_typeof(item) <> 'object' or coalesce(item->>'type','') not in ('text','product','image','shape')
     or (item->>'width') is null or (item->>'height') is null
     or (item->>'x') is null or (item->>'y') is null
     or (item->>'width')::numeric <= 0 or (item->>'height')::numeric <= 0
     or (item->>'x')::numeric < 0 or (item->>'y')::numeric < 0 then
   raise exception 'Elemento da arte inválido.';
  end if;
  foreach source_key in array array['src','image'] loop
   source := coalesce(item->>source_key,'');
   if source <> '' and source <> './assets/logo-original.jpg'
      and source !~ '^\./assets/encartes/camadas/[a-z0-9-]+\.png$'
      and source !~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Imagem da arte inválida.';
   end if;
  end loop;
 end loop;
 return clean;
end $function$;
revoke all on function sp_private.validate_flyer_record(jsonb) from public, anon, authenticated;

-- Insert a narrowly scoped early dispatch after the existing authorization.
-- Abort instead of replacing an unexpected version of the generic validator.
do $patch$
declare definition text; anchor constant text := 'perform sp_private.require_access(company,resource,true);';
begin
 definition := pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure);
 if position('sp_private.validate_flyer_record' in definition) > 0
    or (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Versão inesperada de validate_record; revise a migração de encartes.';
 end if;
 execute replace(definition,anchor,anchor || E'\n if resource=''flyers'' then return sp_private.validate_flyer_record(input); end if;');
end $patch$;

-- Additive RPC: return only the committed revision and server timestamps.
-- Existing sp_save clients retain their full-document response contract.
create or replace function sp_private.save_flyer(company uuid, input jsonb, expected bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
 record_key text := coalesce(nullif(input->>'id',''),gen_random_uuid()::text);
 current_version bigint;
 next_version bigint;
 clean jsonb;
 saved_created_at timestamptz;
 saved_updated_at timestamptz;
begin
 perform sp_private.require_access(company,'flyers',true);
 -- Same key and ordering as persist_record, so old and new RPCs serialize together.
 perform pg_advisory_xact_lock(hashtextextended(company::text||'flyers'||record_key,0));
 select version into current_version from public.flyers
 where company_id=company and id=record_key for update;
 if current_version is not null and expected is distinct from current_version then
  raise exception 'Este registro foi alterado em outra sessão. Recarregue antes de salvar.' using errcode='40001';
 end if;
 if current_version is null and expected is not null then
  raise exception 'Registro removido por outra sessão.' using errcode='40001';
 end if;
 if input->>'id' is distinct from record_key then
  input := input || jsonb_build_object('id',record_key);
 end if;
 clean := sp_private.validate_flyer_record(input);
 next_version := coalesce(current_version,0)+1;
 insert into public.flyers(company_id,id,data,version) values(company,record_key,clean,next_version)
 on conflict(company_id,id) do update set data=excluded.data,version=excluded.version,updated_at=now()
 returning created_at,updated_at into saved_created_at,saved_updated_at;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,version)
 values(company,auth.uid(),'flyers',record_key,case when current_version is null then 'create' else 'update' end,next_version);
 return jsonb_build_object('id',record_key,'_version',next_version,'createdAt',saved_created_at,'updatedAt',saved_updated_at);
end $function$;
revoke all on function sp_private.save_flyer(uuid,jsonb,bigint) from public, anon, authenticated;
-- The private schema remains inaccessible over PostgREST; this follows existing RPC grants.
grant execute on function sp_private.save_flyer(uuid,jsonb,bigint) to authenticated;
create or replace function public.sp_flyer_save(p_company_id uuid,p_record jsonb,p_expected_version bigint default null)
returns jsonb language sql set search_path = '' as $function$
 select sp_private.save_flyer(p_company_id,p_record,p_expected_version)
$function$;
revoke all on function public.sp_flyer_save(uuid,jsonb,bigint) from public, anon;
grant execute on function public.sp_flyer_save(uuid,jsonb,bigint) to authenticated;
notify pgrst, 'reload schema';
