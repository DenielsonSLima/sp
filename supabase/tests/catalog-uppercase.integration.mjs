import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const migration = 'migrations/20261102032923_butcher_animal_product_models.sql';
const sql = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;
    create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of ['schema.sql','catalog-schema.sql','migrations/20261031031813_optimize_product_media_rpc.sql',
    'migrations/20261031032723_product_photo_storage.sql','migrations/20261031043008_product_server_pagination.sql',
    'migrations/20261031050550_quote_header_creation.sql','migrations/20261031054608_partner_company_details.sql']) await db.exec(sql(file));
  await db.query('insert into auth.users values($1,$2)', [owner, 'butcher@example.com']);
  const company = (await db.query("select sp_private.bootstrap_company('butcher@example.com','Supermercado do Povo') id")).rows[0].id;
  await db.exec(sql(migration));
  assert.equal((await db.query('select count(*) n from public.products')).rows[0].n, 49);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const save = (resource, record, version = null) => rpc('sp_save', [company, resource, record, version]);
  const category = (await rpc('sp_list',[company,'product_categories'])).find(c=>c.name==='Açougue');
  const existing = await save('product_categories',{name:'Carnes bovinas',parentId:category.id});
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';
  const branded = await save('products',{name:'Acém bovino Friboi Reserva',category:'Açougue',unit:'KG',subcategoryId:existing.id,photos:[photo],code:'aB-123'});
  const before = await rpc('sp_list',[company,'products']);
  await db.exec('reset role');
  await db.exec(sql('migrations/20261102035027_catalog_uppercase_and_butcher_subcategories.sql'));
  await db.exec('set role authenticated');
  const after = await rpc('sp_list',[company,'products']);
  assert.equal(after.length,before.length);
  for (const p of after) {
    assert.equal(p.name,p.name.toUpperCase());
    assert.equal(p.category,'AÇOUGUE');
    assert.ok(p.subcategoryId);
    assert.equal(p.subcategory,p.subcategory.toUpperCase());
    const previous=before.find(row=>row.id===p.id);
    assert.equal(p.unit,previous.unit);
  }
  const cats=await rpc('sp_list',[company,'product_categories']);
  assert.equal(cats.filter(c=>c.name==='CARNES BOVINAS').length,1);
  assert.equal(cats.find(c=>c.name==='CARNES BOVINAS').id,existing.id);
  assert.equal(after.find(p=>p.id===branded.id).code,'aB-123');
  assert.deepEqual((await rpc('sp_get',[company,'products',branded.id])).photos,[photo]);
  assert.equal(after.find(p=>p.name==='CARNE CAPRINA PERNIL KG').subcategory,'CARNES CAPRINAS');
  assert.equal(after.find(p=>p.name==='MOCOTÓ BOV. UND').subcategory,'MIÚDOS BOVINOS');
  const newCat=await save('product_categories',{name:'congelados novos'});
  assert.equal(newCat.name,'CONGELADOS NOVOS');
  const newSub=await save('product_categories',{name:'pães e massas',parentId:newCat.id});
  assert.equal(newSub.name,'PÃES E MASSAS');
  const fresh=await save('products',{name:'pão de queijo',category:'congelados novos',subcategoryId:newSub.id,unit:'KG'});
  assert.equal(fresh.name,'PÃO DE QUEIJO');
  assert.equal(fresh.category,'CONGELADOS NOVOS');
  assert.equal(fresh.subcategory,'PÃES E MASSAS');
  const renamed=await save('product_categories',{...newSub,name:'Massas e pães'},newSub._version);
  assert.equal(renamed.name,'MASSAS E PÃES');
  const linked=await rpc('sp_get',[company,'products',fresh.id]);
  assert.equal(linked.subcategory,'MASSAS E PÃES');
  await assert.rejects(()=>save('products',{...fresh,name:'nome antigo'},fresh._version),/outra sessão/);
  const updated=await save('products',{...linked,name:'pão novo'},linked._version);
  assert.equal(updated.name,'PÃO NOVO');
  assert.ok((await db.query("select revision from public.resource_changes where company_id=$1 and resource='products'",[company])).rows[0].revision>0);
  await assert.rejects(()=>db.query("update public.products set data=data||'{\"name\":\"forjado\"}' where id=$1",[fresh.id]),/permission denied/);
  console.log('Catalog uppercase: existing data, accents, photos, IDs, subcategories, RPC creation/editing, concurrency and permissions passed.');
} finally { await db.close(); }
