import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sql = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result;
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;
    create schema storage;create table storage.objects(
      id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  const foundation = ['schema.sql','catalog-schema.sql',
    'migrations/20261031031813_optimize_product_media_rpc.sql',
    'migrations/20261031032723_product_photo_storage.sql',
    'migrations/20261031043008_product_server_pagination.sql',
    'migrations/20261031050550_quote_header_creation.sql',
    'migrations/20261031054608_partner_company_details.sql'];
  for (const file of foundation) await db.exec(sql(file));
  await db.query('insert into auth.users values($1,$2),($3,$4)',
    [owner,'butcher-entry@example.com',other,'other-entry@example.com']);
  const company = (await db.query(
    "select sp_private.bootstrap_company('butcher-entry@example.com','Supermercado do Povo') id",
  )).rows[0].id;
  const otherCompany = (await db.query(
    "select sp_private.bootstrap_company('other-entry@example.com','Other company') id",
  )).rows[0].id;
  for (const file of [
    'migrations/20261102032923_butcher_animal_product_models.sql',
    'migrations/20261102035027_catalog_uppercase_and_butcher_subcategories.sql',
    'migrations/20261102035310_butcher_model_weighing_reference.sql',
    'migrations/20261102040441_butcher_weighing_reference_null_fix.sql',
    'migrations/20261102040624_butcher_model_partial_composition.sql',
    'migrations/20261103003224_butcher_optional_sex.sql',
    'migrations/20261102040347_resource_summary_pages.sql',
  ]) await db.exec(sql(file));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const products = await rpc('sp_list',[company,'products']);
  const meat = products.find((p) => p.name === 'CARNE BOV. PICANHA KG');
  const foot = products.find((p) => p.name === 'MOCOTÓ BOV. UND');
  const save = (record, version = null) => rpc('sp_save',[company,'butcher_models',record,version]);
  let model = await save({ name:'Rendimento cadastrado',species:'bovine',parts:[
    {productId:meat.id,percent:'2,5'},{productId:foot.id,quantityPerAnimal:'4'},
  ]});
  model = await save({id:model.id,action:'setCurrent'},model._version);
  const calculate = (input) => rpc('sp_calculate',[company,'butcher',input]);
  const create = (input) => rpc('sp_command',[company,'butcher_receipts','create',null,input,null]);
  const basic = {category:model.category,animalCount:'2',receivedDate:'2026-11-02',weight:'400'};
  const legacy = await create(basic);
  await db.exec('reset role');
  await db.exec(sql('migrations/20261103004241_butcher_purchase_entry.sql'));
  await db.exec('set role authenticated');
  assert.deepEqual(await rpc('sp_get',[company,'butcher_receipts',legacy.id]),legacy);
  assert.equal((await calculate(basic)).rows[0].estimatedGrams,10000);
  assert.equal((await calculate(basic)).purchaseTotalCents,null);
  const sections = [
    {type:'forequarter',side:'left',quantity:'2',weight:'80'},
    {type:'forequarter',side:'right',quantity:'2',weight:'80'},
    {type:'hindquarter',side:'left',quantity:'2',weight:'120'},
    {type:'hindquarter',side:'right',quantity:'2',weight:'120'},
  ];
  const input = {...basic,weightMode:'parts',sections,purchaseTotal:'R$ 12.345,67',notes:'Compra única do lote'};
  const estimate = await calculate(input);
  assert.equal(estimate.weightGrams,400000,'Section weight is total per line, not multiplied by quantity.');
  assert.equal(estimate.animalCount,2);
  assert.equal(estimate.weightMode,'parts');
  assert.equal(estimate.purchaseTotalCents,1234567);
  assert.equal(estimate.purchaseCostPerKgCents,3086);
  assert.equal(estimate.sections.reduce((sum,s) => sum+s.allocatedCostCents,0),1234567);
  assert.deepEqual(estimate.sections.map((s) => s.allocatedCostCents),[246914,246913,370370,370370]);
  assert.equal(estimate.sections[0].quantity,2);
  assert.equal(estimate.rows[0].estimatedGrams,10000,'Existing yield is applied once to total received weight.');
  assert.equal(estimate.rows[1].quantity,8);
  assert.equal(estimate.yieldBasis,'received_total');
  assert.equal(estimate.purchaseAllocationBasis,'received_weight');
  assert.equal(estimate.rows[0].allocatedCostCents,undefined,'Commercial cut cost is deferred.');
  assert.equal(estimate.notes,input.notes);
  const total = await calculate({...basic,purchaseTotal:'12.345,67',notes:'Peso total'});
  assert.equal(total.purchaseTotalCents,estimate.purchaseTotalCents);
  assert.equal(total.purchaseCostPerKgCents,estimate.purchaseCostPerKgCents);
  assert.deepEqual(total.sections,[]);
  const rounding = await calculate({...input,animalCount:'1',purchaseTotal:'0,01',
    sections:sections.map((s) => ({...s,quantity:'1',weight:'0,001'}))});
  assert.equal(rounding.weightGrams,4);
  assert.deepEqual(rounding.sections.map((s) => s.allocatedCostCents),[1,0,0,0]);
  const repeated = await calculate({...input,sections:[
    {...sections[0],quantity:'1',weight:'30'},
    {...sections[0],quantity:'1',weight:'50'},...sections.slice(1),
  ]});
  assert.equal(repeated.weightGrams,400000);
  assert.equal(repeated.sections.reduce((sum,s) => sum+s.allocatedCostCents,0),1234567);
  const individual = await calculate({...basic,weightMode:'individual',purchaseTotal:'10000,00',
    animals:[{identification:'A',weight:'150'},{identification:'B',weight:'250'}]});
  assert.equal(individual.weightGrams,400000);
  assert.equal(individual.animals.length,2);
  assert.equal(individual.purchaseTotalCents,1000000);
  const signalBefore = (await db.query(
    "select revision from public.resource_changes where company_id=$1 and resource='butcher_receipts'",[company],
  )).rows[0].revision;
  const saved = await create({...input,expectedModelId:model.id,expectedModelVersion:model._version,
    purchaseTotalCents:1,weightGrams:1,sections:sections.map((s) => ({...s,allocatedCostCents:1})),
  });
  assert.equal(saved.purchaseTotalCents,1234567,'Client calculated values are ignored.');
  assert.equal(saved.weightGrams,400000);
  assert.deepEqual(await rpc('sp_get',[company,'butcher_receipts',saved.id]),saved);
  const list = await rpc('sp_resource_page',[company,'butcher_receipts',1,12,'','','','','','active']);
  const summary = list.items.find((r) => r.id === saved.id);
  assert.equal(summary.purchaseTotalCents,1234567);
  assert.equal(summary.purchaseCostPerKgCents,3086);
  assert.equal(summary.rows,undefined);
  assert.ok((await db.query(
    "select revision from public.resource_changes where company_id=$1 and resource='butcher_receipts'",[company],
  )).rows[0].revision>signalBefore);
  for (const purchaseTotal of ['',null,'-1','0','1,234','abc','1000000,01']) {
    await assert.rejects(() => calculate({...input,purchaseTotal}),/Valor total|reais/);
  }
  await assert.rejects(() => calculate({...input,notes:'x'.repeat(4001)}),/4.000/);
  await assert.rejects(() => calculate({...input,sections:[]}),/dianteiros/);
  await assert.rejects(() => calculate({...input,sections:{}}),/dianteiros/);
  await assert.rejects(() => calculate({...input,sections:sections.slice(0,3)}),/quatro quartos/);
  for (const patch of [{quantity:'1.5'},{quantity:'0'},{quantity:'1001'},{weight:'0'},
    {weight:'-1'},{weight:'0,0001'},{side:'middle'},{type:'wing'}, {type:null}]) {
    await assert.rejects(() => calculate({...input,sections:[{...sections[0],...patch},...sections.slice(1)]}));
  }
  await assert.rejects(() => calculate({...input,animalCount:'1'}),/quatro quartos/);
  await assert.rejects(() => calculate({...input,sections:sections.map((s) => ({...s,weight:'30000'}))}),/100.000/);
  await assert.rejects(() => calculate({...input,receivedDate:'2026-02-30'}),/Data/);
  await assert.rejects(() => create({...input,expectedModelVersion:1}),/Modelo alterado/);
  await assert.rejects(() => create({...input,expectedModelId:'outdated'}),/Modelo atual alterado/);
  const swine = await save({name:'Suíno',species:'swine',parts:[{productId:meat.id,percent:'10'}]});
  await save({id:swine.id,action:'setCurrent'},swine._version);
  await assert.rejects(() => calculate({...input,category:swine.category}),/modelo bovino/);
  await assert.rejects(() => rpc('sp_calculate',[otherCompany,'butcher',input]),/não autorizado/);
  await assert.rejects(() => db.query('insert into public.butcher_receipts(id,company_id,data) values($1,$2,$3)',
    ['tamper',company,{}]),/permission denied/);
  await assert.rejects(() => db.query('select sp_private.butcher_yield_estimate($1,$2)',[company,basic]),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  assert.equal((await db.query('select count(*) n from public.butcher_receipts')).rows[0].n,0);
  await assert.rejects(() => rpc('sp_get',[company,'butcher_receipts',saved.id]),/não autorizado/);
  await db.exec('reset role;set role anon');
  await assert.rejects(() => calculate(input),/permission denied/);
  await db.exec(`reset role;create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    insert into supabase_migrations.schema_migrations values('20261103004241');`);
  const verification = await db.exec(sql('tests/butcher-entry.remote-verification.sql'));
  const evidence = verification.flatMap((r) => r.rows).find((r) => r.evidence)?.evidence;
  assert.equal(evidence.receiptRoundTrip,true);
  assert.equal(evidence.modelsPreserved,true);
  assert.equal(evidence.receiptsPreserved,true);
  assert.equal(evidence.signalsPreserved,true);
  console.log('PASS: butcher receiving purchase, quarters, complete bovine weight basis, cents conservation, legacy, snapshots, lists, authorization and Realtime.');
} catch (error) {
  console.error(error.message,error.where || '',error.stack);
  process.exitCode = 1;
} finally { await db.close(); }
