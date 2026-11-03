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
  await db.exec('reset role');
  await db.exec(sql('migrations/20261102035027_catalog_uppercase_and_butcher_subcategories.sql'));
  await db.exec(sql('migrations/20261102035310_butcher_model_weighing_reference.sql'));
  await db.exec(sql('migrations/20261102040441_butcher_weighing_reference_null_fix.sql'));
  await db.exec(sql('migrations/20261102040624_butcher_model_partial_composition.sql'));
  await db.exec(sql('migrations/20261103003224_butcher_optional_sex.sql'));
  await db.exec('set role authenticated');
  const products=await rpc('sp_list',[company,'products']);
  const meat=products.find(p=>p.name==='CARNE BOV. PICANHA KG');
  const second=products.find(p=>p.name==='CARNE BOV. COXÃO MOLE KG');
  const foot=products.find(p=>p.name==='MOCOTÓ BOV. UND');
  const weigh=input=>rpc('sp_calculate',[company,'butcher_model_weighing',input]);
  const parts=[{productId:meat.id,weight:'5',active:true},{productId:second.id,weight:'20,5',active:true},{productId:foot.id,quantityPerAnimal:'4',active:true}];
  const preview=await weigh({totalWeight:'250',parts});
  assert.equal(preview.totalGrams,250000);
  assert.equal(preview.distributedGrams,25500);
  assert.equal(preview.remainingGrams,224500);
  assert.equal(preview.rows.length,2);
  assert.equal(preview.rows[0].percentBps,200);
  assert.equal(preview.rows[1].percentBps,820);
  const base={name:'Referência pesada',species:'bovine',sex:'male',compositionMode:'weight',weighingTotal:'250',parts};
  let model=await save('butcher_models',{name:base.name,species:base.species,sex:base.sex,parts:[]});
  assert.equal(model.weighing,null);
  model=await save('butcher_models',{...base,id:model.id},model._version);
  assert.equal(model.totalBps,1020);
  assert.equal(model.parts[0].percentBps,200);
  assert.equal(model.parts[2].quantityPerAnimal,4);
  assert.equal(model.weighing.totalGrams,250000);
  assert.ok(model.weighing.recordedAt);
  const timestamp=model.weighing.recordedAt;
  // Renaming the canonical saved model preserves its weights and percentages.
  model=await save('butcher_models',{...model,name:'Referência renomeada'},model._version);
  assert.equal(model.weighing.recordedAt,timestamp);
  assert.equal(model.parts[0].percentBps,200);
  assert.equal((await rpc('sp_get',[company,'butcher_models',model.id])).weighing.rows[1].weightGrams,20500);
  const weightedAgain=await save('butcher_models',{...base,id:model.id,parts:parts.map(p=>({...p,percent:'99'}))},model._version);
  assert.equal(weightedAgain.totalBps,1020,'client percentages cannot forge weight-based results');
  const manual=await save('butcher_models',{...base,id:model.id,compositionMode:'percent',parts:parts.map(p=>({...p,percent:p.productId===meat.id?'3':'10'}))},weightedAgain._version);
  assert.equal(manual.totalBps,1300);
  assert.equal(manual.weighing.rows[0].weightGrams,5000,'reference remains recorded when manual percentages change');
  assert.equal((await weigh({totalWeight:'0',parts})).complete,false);
  await assert.rejects(()=>weigh({totalWeight:'10',parts}),/superar|ultrapassar/);
  await assert.rejects(()=>weigh({totalWeight:'10',parts:[{productId:meat.id,weight:'7'},{productId:second.id,weight:'4'}]}),/soma/);
  await assert.rejects(()=>weigh({totalWeight:'10',parts:[{productId:meat.id,weight:'-1'}]}),/positivo|negativo|inválido|maior|limite/);
  await assert.rejects(()=>weigh({totalWeight:'10',parts:[{productId:'other-company',weight:'1'}]}),/encontrado/);
  assert.equal((await weigh({totalWeight:'250',parts:[{productId:meat.id,weight:''}]})).complete,false);
  const partial=await save('butcher_models',{...base,parts:[{productId:meat.id,weight:''}]});
  assert.equal(partial.ready,false);
  assert.equal(partial.parts[0].percentBps,null);
  const noTotal=await save('butcher_models',{...base,weighingTotal:''});
  assert.equal(noTotal.ready,false);
  assert.equal(noTotal.weighing.rows[0].weightGrams,5000);
  let draft=await save('butcher_models',{...base,compositionMode:'percent',weighingTotal:'',parts:[{productId:meat.id,percent:''},{productId:foot.id,quantityPerAnimal:''}]});
  assert.equal(draft.parts.length,2);
  assert.equal(draft.parts[0].percentBps,null);
  assert.equal(draft.parts[1].quantityPerAnimal,null);
  assert.equal(draft.ready,false);
  assert.equal((await rpc('sp_get',[company,'butcher_models',draft.id])).parts.length,2);
  await assert.rejects(()=>save('butcher_models',{id:draft.id,action:'setCurrent'},draft._version),/modelo|Preencha/);
  draft=await save('butcher_models',{...draft,parts:[{productId:meat.id,percent:'2'},{productId:foot.id,quantityPerAnimal:'4'}]},draft._version);
  assert.equal(draft.ready,true);
  draft=await save('butcher_models',{id:draft.id,action:'setCurrent'},draft._version);
  assert.equal(draft.current,true);
  draft=await save('butcher_models',{...draft,parts:[{productId:meat.id,percent:'0'},{productId:foot.id,quantityPerAnimal:'0'}]},draft._version);
  assert.equal(draft.ready,false);
  assert.equal(draft.current,false,'incomplete models cannot remain current');
  const thirds=products.filter(p=>p.unit==='KG').slice(0,3).map(p=>({productId:p.id,weight:'1'}));
  const rounded=await weigh({totalWeight:'3',parts:thirds});
  assert.equal(rounded.rows.reduce((n,p)=>n+p.percentBps,0),10000);
  const full=await save('butcher_models',{...base,weighingTotal:'3',parts:thirds});
  assert.equal(full.totalBps,10000);
  await assert.rejects(()=>save('butcher_models',{...manual,name:'antigo'},1),/outra sessão/);
  // Species-only creation does not invent a sex and supports the full receipt flow.
  for (const [species, category] of [
    ['bovine', 'Bovino — boi / vaca'], ['swine', 'Suíno — porco / porca'],
    ['caprine', 'Caprino — bode / cabra'], ['ovine', 'Ovino — carneiro / ovelha'],
    ['poultry', 'Aves — galo / galinha'],
  ]) {
    const created = await save('butcher_models', { name: category, species, parts: [] });
    assert.equal(created.sex, null);
    assert.equal(created.category, category);
  }
  let generic = await save('butcher_models', {
    name: 'Bovino sem sexo', species: 'bovine',
    parts: [{ productId: meat.id, percent: '25' }, { productId: foot.id, quantityPerAnimal: '4' }],
  });
  generic = await save('butcher_models', { id: generic.id, action: 'setCurrent' }, generic._version);
  const receipt = await rpc('sp_command', [company, 'butcher_receipts', 'create', null, {
    category: generic.category, animalCount: '2', weight: '500', receivedDate: '2026-11-02',
    expectedModelId: generic.id, expectedModelVersion: generic._version,
  }, null]);
  assert.equal(receipt.category, 'Bovino — boi / vaca');
  assert.equal(receipt.rows[0].estimatedGrams, 125000);
  assert.equal(receipt.rows[1].quantity, 8);
  await assert.rejects(() => save('butcher_models', { ...generic, species: 'swine' }, generic._version), /outro modelo/);
  await assert.rejects(() => save('butcher_models', { name: 'Inválido', species: '', parts: [] }), /espécie/);
  await assert.rejects(() => save('butcher_models', { name: 'Inválido', species: 'bovine', sex: 'unknown', parts: [] }), /Sexo/);
  const { sex: historicalSex, ...historical } = manual;
  const renamed = await save('butcher_models', { ...historical, name: 'Histórico preservado' }, manual._version);
  assert.equal(renamed.sex, historicalSex);
  assert.equal(renamed.category, manual.category);
  assert.equal(renamed.weighing.recordedAt, manual.weighing.recordedAt);
  assert.deepEqual(await rpc('sp_get', [company, 'butcher_receipts', receipt.id]), receipt);
  await db.exec('set role anon');
  await assert.rejects(()=>weigh({totalWeight:'250',parts}),/permission denied/);
  console.log('Model weighing: previews, grams, percentage rounding, UND, persistence, reference history, forged percent defense, invalid/overflow/partial weights, permissions and concurrency passed.');
} finally { await db.close(); }
