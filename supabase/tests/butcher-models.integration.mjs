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
  const products = await rpc('sp_list', [company, 'products']);
  const meat = products.find((p) => p.name === 'CARNE BOV. PICANHA KG');
  const second = products.find((p) => p.name === 'CARNE BOV. COXÃO MOLE KG');
  const foot = products.find((p) => p.name === 'MOCOTÓ BOV. UND');
  const base = { name: 'Padrão bovino', species: 'bovine', sex: 'male', parts: [] };
  let model = await save('butcher_models', base);
  assert.equal(model.category, 'Bovino · Macho'); assert.equal(model.totalBps, 0);
  await assert.rejects(() => save('butcher_models', { id: model.id, action: 'setCurrent' }, model._version), /com partes/);
  const parts = [{ productId: meat.id, percent: '25' }, { productId: foot.id, quantityPerAnimal: '4' }];
  model = await save('butcher_models', { ...model, parts }, model._version);
  assert.equal(model.parts[0].name, meat.name); assert.equal(model.parts[1].percentBps, 0);
  assert.equal(model.totalBps, 2500);
  await assert.rejects(() => save('butcher_models', { ...model, parts }, 1), /outra sessão/);
  await assert.rejects(() => save('butcher_models', { ...base, sex: 'unknown' }), /sexo/);
  await assert.rejects(() => save('butcher_models', { ...base, parts: [parts[0], parts[0]] }), /repetidos/);
  await assert.rejects(() => save('butcher_models', { ...base, parts: [{ productId: meat.id, percent: '100' }, { productId: second.id, percent: '0,01' }] }), /100/);
  for (const quantityPerAnimal of ['', '0', '-1', '1.5', '1001']) {
    await assert.rejects(() => save('butcher_models', { ...base, parts: [{ productId: foot.id, quantityPerAnimal }] }), /inteira|unidades/);
  }
  await assert.rejects(() => save('butcher_models', { ...base, parts: [{ productId: 'foreign-id', percent: '20' }] }), /não encontrado/);
  model = await save('butcher_models', { id: model.id, action: 'setCurrent' }, model._version);
  let female = await save('butcher_models', { ...base, sex: 'female', parts: [{ productId: second.id, percent: '30' }] });
  female = await save('butcher_models', { id: female.id, action: 'setCurrent' }, female._version);
  assert.equal((await rpc('sp_get', [company, 'butcher_models', model.id])).current, true);
  const input = { category: model.category, animalCount: '3', weight: '750', receivedDate: '2026-11-02' };
  const estimate = await rpc('sp_calculate', [company, 'butcher', input]);
  assert.equal(estimate.rows[0].estimatedGrams, 187500);
  assert.equal(estimate.rows[1].estimatedGrams, null); assert.equal(estimate.rows[1].quantity, 12);
  assert.equal(estimate.unallocatedGrams, 562500);
  const counted = await rpc('sp_calculate', [company, 'butcher', { ...input, quantities: { [foot.id]: '0' } }]);
  assert.equal(counted.rows[1].quantity, 0); assert.equal(counted.rows[1].quantitySource, 'manual');
  const receipt = await rpc('sp_command', [company, 'butcher_receipts', 'create', null, { ...input, expectedModelId: model.id, expectedModelVersion: model._version }, null]);
  const previousVersion = model._version;
  model = await save('butcher_models', { ...model, parts: [{ productId: meat.id, percent: '50' }, parts[1]] }, model._version);
  await assert.rejects(() => rpc('sp_command', [company, 'butcher_receipts', 'create', null, { ...input, expectedModelVersion: previousVersion }, null]), /Modelo alterado/);
  assert.deepEqual(await rpc('sp_get', [company, 'butcher_receipts', receipt.id]), receipt);
  const onlyUnits = await save('butcher_models', { ...base, species: 'swine', parts: [parts[1]] });
  await save('butcher_models', { id: onlyUnits.id, action: 'setCurrent' }, onlyUnits._version);
  const unitEstimate = await rpc('sp_calculate', [company, 'butcher', { ...input, category: onlyUnits.category }]);
  assert.equal(unitEstimate.unallocatedGrams, 750000); assert.equal(unitEstimate.rows[0].quantity, 12);
  await assert.rejects(() => rpc('sp_delete', [company, 'products', foot.id, foot._version]), /vinculado/);
  await assert.rejects(() => rpc('sp_save', ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'butcher_models', base, null]), /não autorizado/);
  await assert.rejects(() => db.query('delete from public.butcher_models where id=$1', [model.id]), /permission denied/);
  const legacy = await save('butcher_models', { name: 'Anterior', category: 'Boi antigo', parts: [{ name: 'Corte', unit: 'KG', percent: '50' }] });
  await save('butcher_models', { id: legacy.id, action: 'setCurrent' }, legacy._version);
  assert.equal((await rpc('sp_calculate', [company, 'butcher', { ...input, category: 'Boi antigo' }])).rows[0].estimatedGrams, 375000);
  assert.ok((await db.query("select revision from public.resource_changes where company_id=$1 and resource='butcher_models'", [company])).rows[0].revision >= 8);
  await db.exec('reset role; set role anon');
  await assert.rejects(() => save('butcher_models', base), /permission denied/);
  await assert.rejects(() => db.query('select sp_private.validate_animal_model($1,$2,null)', [company, base]), /permission denied/);
  console.log('PASS: animal models, 49 products, species/sex, KG and UND, concurrency, snapshots, legacy compatibility, authorization and Realtime.');
} catch (error) { console.error(error.message, error.where || '', error.stack); process.exitCode = 1; }
finally { await db.close(); }
