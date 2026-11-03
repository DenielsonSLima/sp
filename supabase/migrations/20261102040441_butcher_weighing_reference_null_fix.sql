-- Models first saved in percent mode have a JSON null reference, not a SQL NULL.
do $$
declare src text; marker text:='(old->''weighing'')-''recordedAt''';
begin
  src:=pg_get_functiondef('sp_private.validate_animal_model(uuid,jsonb,jsonb)'::regprocedure);
  if position(marker in src)=0 then raise exception 'Unexpected weighing validator source'; end if;
  src:=replace(src,marker,'coalesce(nullif(old->''weighing'',''null''::jsonb),''{}''::jsonb)-''recordedAt''');
  src:=replace(src,'coalesce(input->''weighing'',old->''weighing'')',
    'coalesce(nullif(input->''weighing'',''null''::jsonb),nullif(old->''weighing'',''null''::jsonb))');
  execute src;
end $$;
