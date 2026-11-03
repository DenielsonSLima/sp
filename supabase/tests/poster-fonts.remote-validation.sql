with base as (select data from public.poster_templates order by company_id,id limit 1),
fonts as (select unnest(array['Anton','Bebas Neue','Oswald','Barlow Condensed','Roboto Condensed','Archivo Black','Alfa Slab One','Bungee','Lilita One','Paytone One','Passion One','Fugaz One','Righteous','Staatliches','Montserrat','Poppins','Nunito Sans','Rubik','Lato','Barlow']) as family),
validated as (
 select family, sp_private.validate_template(
   jsonb_set(jsonb_set(data,'{font}',to_jsonb(family)),'{layout}',
     (select jsonb_object_agg(key,jsonb_set(value,'{fontFamily}',to_jsonb(family))) from jsonb_each(data->'layout')))
 ) as result
 from base cross join fonts
)
select count(*) as accepted_new_fonts,
 bool_and(result->>'font'=family and result#>>'{layout,price,fontFamily}'=family) as all_fonts_preserved,
 (select md5(statements[1]) from supabase_migrations.schema_migrations where version='20261102030842') as migration_md5
from validated;
