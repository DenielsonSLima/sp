/** Rebuild the reviewed, one-time SQL migration. Never imported by the frontend. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const snapshot=JSON.parse(readFileSync(new URL('../supabase/seeds/original-catalog-v1.json',import.meta.url),'utf8'));
const migration=new URL('../supabase/migrations/20261031030545_migrate_existing_catalog.sql',import.meta.url);
if(snapshot.projectRef!=='enhoierfwuwtzulznjxa')throw Error('Unexpected source project.');
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const products=snapshot.products.map(({asset,assetSha256,assetBytes,...fields})=>{
 const target=path.resolve(root,asset);if(!target.startsWith(path.join(root,'assets')+path.sep))throw Error('Asset path is outside assets/.');
 const bytes=readFileSync(target);if(bytes.length!==assetBytes||createHash('sha256').update(bytes).digest('hex')!==assetSha256)throw Error(`Source photo changed: ${asset}`);
 if(bytes.length>3*1024*1024||!mime[path.extname(target)])throw Error(`Invalid catalog image: ${asset}`);
 return {...fields,code:'',photos:[`data:${mime[path.extname(target)]};base64,${bytes.toString('base64')}`],catalogSource:{migration:'original-catalog-v1',assetSha256}};
});
const assets=[...new Map(snapshot.flyerTemplates.flatMap(t=>t.assets||[]).map(a=>[a.id,a])).values()];
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const seed=`
-- Migrates only original catalog records to the existing owner company.
-- It never imports demo partners, users, purchases, quotes or browser storage.
do $catalog_seed$
declare company uuid;owner_id uuid;matches integer;entry jsonb;normalized jsonb;unit_id text;resource text;items jsonb;affected integer;inserted_products integer:=0;preserved_products integer:=0;restored_templates integer:=0;inserted_flyers integer:=0;inserted_assets integer:=0;begin
 select count(*),min(c.id::text)::uuid,min(m.user_id::text)::uuid into matches,company,owner_id
 from public.companies c join public.memberships m on m.company_id=c.id and m.role='owner' and m.active join auth.users u on u.id=m.user_id
 where c.name='Supermercado do Povo' and lower(u.email)='denielsonlima201099@gmail.com';
 if matches<>1 then raise exception 'Expected exactly one authorized owner company; found %.',matches;end if;
 if exists(select 1 from public.audit_log a where a.company_id=company and a.resource='catalog_migration' and a.record_id='original-catalog-v1' and a.details->>'status'='complete') then return;end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 for entry in select * from jsonb_array_elements(${literal(snapshot.productCategories.map(name=>({id:'category-'+createHash('md5').update(name.toLowerCase()).digest('hex'),name})))}) loop
 if not exists(select 1 from public.product_categories where company_id=company and lower(data->>'name')=lower(entry->>'name')) then
 normalized:=sp_private.validate_record(company,'product_categories',entry);insert into public.product_categories(company_id,id,data) values(company,entry->>'id',normalized) on conflict(company_id,id) do nothing;end if;end loop;
 for entry in select * from jsonb_array_elements(${literal(products)}) loop
 -- Existing IDs or equivalent catalog names are preserved, including user edits/photos.
 if exists(select 1 from public.products where company_id=company and (id=entry->>'id' or lower(data->>'name')=lower(entry->>'name') and lower(data->>'category')=lower(entry->>'category'))) then preserved_products:=preserved_products+1;continue;end if;
 select id into unit_id from public.units where company_id=company and upper(data->>'symbol')=upper(entry->>'unit');
 if unit_id is null then raise exception 'Missing unit for catalog product: %.',entry->>'name';end if;
 normalized:=sp_private.validate_record(company,'products',entry||jsonb_build_object('unit',unit_id));
 insert into public.products(company_id,id,data) values(company,entry->>'id',normalized) on conflict(company_id,id) do nothing;get diagnostics affected=row_count;inserted_products:=inserted_products+affected;
 end loop;
 for entry in select * from jsonb_array_elements(${literal(snapshot.posterTemplates)}) loop
 normalized:=sp_private.validate_record(company,'poster_templates',entry);
 insert into public.poster_templates(company_id,id,data) values(company,entry->>'id',normalized)
 on conflict(company_id,id) do update set data=excluded.data,version=poster_templates.version+1,updated_at=now()
 where poster_templates.version=1 and poster_templates.data=entry||jsonb_build_object('color','#c51d2b','background','#ffffff');get diagnostics affected=row_count;restored_templates:=restored_templates+affected;
 end loop;
 for entry in select * from jsonb_array_elements(${literal(snapshot.brandCategories.map(name=>({id:'brand-category-'+createHash('md5').update(name.toLowerCase()).digest('hex'),name})))}) loop
 if not exists(select 1 from public.brand_categories where company_id=company and lower(data->>'name')=lower(entry->>'name')) then
 normalized:=sp_private.validate_record(company,'brand_categories',entry);insert into public.brand_categories(company_id,id,data) values(company,entry->>'id',normalized) on conflict(company_id,id) do nothing;end if;end loop;
 for resource,items in select * from (values ('flyer_templates',${literal(snapshot.flyerTemplates.map(({assets,...template})=>template))}),('flyer_assets',${literal(assets)})) resources(resource,items) loop
 for entry in select * from jsonb_array_elements(items) loop
 normalized:=sp_private.validate_record(company,resource,entry);
 execute format('insert into public.%I(company_id,id,data) values($1,$2,$3) on conflict(company_id,id) do nothing',resource) using company,entry->>'id',normalized;get diagnostics affected=row_count;if resource='flyer_templates' then inserted_flyers:=inserted_flyers+affected;else inserted_assets:=inserted_assets+affected;end if;
 end loop;end loop;
 insert into public.audit_log(company_id,actor_id,resource,record_id,action,details) values(company,owner_id,'catalog_migration','original-catalog-v1','import',jsonb_build_object('status','complete','source','supabase/seeds/original-catalog-v1.json','sourceSha256','${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}','sourcePhotoBytes',${snapshot.products.reduce((sum,p)=>sum+p.assetBytes,0)},'productsInserted',inserted_products,'productsPreserved',preserved_products,'posterTemplatesInsertedOrRestored',restored_templates,'flyerTemplatesInserted',inserted_flyers,'flyerAssetsInserted',inserted_assets));
end $catalog_seed$;
notify pgrst,'reload schema';
`;
const sql=readFileSync(new URL('../supabase/catalog-schema.sql',import.meta.url),'utf8')+seed;
if(process.argv.includes('--check')){
 if(readFileSync(migration,'utf8')!==sql)throw Error('Catalog migration differs from its reviewed source. Rebuild before applying.');
}else writeFileSync(migration,sql);
console.log(JSON.stringify({products:products.length,productCategories:snapshot.productCategories.length,flyerTemplates:snapshot.flyerTemplates.length,flyerAssets:assets.length,migrationBytes:Buffer.byteLength(sql),migrationSha256:createHash('sha256').update(sql).digest('hex')}));
