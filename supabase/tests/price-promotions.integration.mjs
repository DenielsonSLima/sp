import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsider = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9l8AAAAASUVORK5CYII=';
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;
    create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of ['schema.sql','catalog-schema.sql',
    'migrations/20261031031813_optimize_product_media_rpc.sql',
    'migrations/20261031032723_product_photo_storage.sql',
    'migrations/20261031043008_product_server_pagination.sql',
    'migrations/20261031050550_quote_header_creation.sql',
    'migrations/20261031054608_partner_company_details.sql',
    'migrations/20261102040347_resource_summary_pages.sql',
    'migrations/20261102040438_metadata_and_realtime_mutation.sql',
    'migrations/20261104012757_price_table_promotions.sql']) await db.exec(read(file));
  await db.query('insert into auth.users values($1,$2),($3,$4)',
    [owner,'price-promo@example.com',outsider,'other-promo@example.com']);
  const company = (await db.query("select sp_private.bootstrap_company('price-promo@example.com','Loja A') id")).rows[0].id;
  const other = (await db.query("select sp_private.bootstrap_company('other-promo@example.com','Loja B') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const save = (resource,input,expected=null) => rpc('sp_save',[company,resource,input,expected]);
  const command = (action,id=null,payload={},expected=null) => rpc('sp_command',[company,'price_tables',action,id,payload,expected]);
  const get = (id) => rpc('sp_get',[company,'price_tables',id]);
  const signal = async () => Number((await db.query(
    "select revision from public.resource_changes where company_id=$1 and resource='price_tables'",[company],
  )).rows[0]?.revision || 0);
  const category = await save('product_categories',{name:'Mercearia'});
  const unit = (await rpc('sp_list',[company,'units'])).find((u) => u.symbol==='UN');
  const p1 = await save('products',{name:'Café',category:category.name,unit:unit.id,photos:Array(5).fill(png)});
  const p3 = await save('products',{name:'Feijão',code:'FEIJAO-003',category:category.name,unit:unit.id,photos:[]});
  let p2 = await save('products',{name:'Arroz',category:category.name,unit:unit.id,photos:[]});
  const photoRefs = Array.from({length:5},(_,index)=>({bucket:'product-photos',
    path:`${company}/products/${p2.id}/photo-${index}.png`,position:index,width:1,height:1}));
  for (const ref of photoRefs) await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('product-photos',$1,$2)",
    [ref.path,{size:1024,mimetype:'image/png'}]);
  p2 = await rpc('sp_product_gallery',[company,p2.id,photoRefs,[],p2._version]);
  const layout = Object.fromEntries(['headline','product','price','validity'].map(k => [k,
    {x:.1,y:.1,w:.8,h:.1,fontSize:4,fontFamily:'Arial',align:'center'}]));
  const template = await save('poster_templates',{name:'Pequeno',color:'#ff0000',background:'#ffffff',font:'Arial',scale:1,widthMm:105,heightMm:148,layout});
  const header = {name:'Ofertas da semana',start:'2026-11-03',end:'2026-11-10',notes:'Enquanto durarem os estoques'};
  for (const bad of [{...header,name:''},{...header,end:''},{...header,end:'2026-11-01'},
    {...header,notes:'x'.repeat(4001)},{name:header.name},{...header,start:null},{...header,end:null}]) await assert.rejects(() => command('createPromotion',null,bad));
  let promo = await command('createPromotion',null,header);
  assert.equal(promo.kind,'promotion'); assert.deepEqual(promo.items,[]); assert.equal(promo._version,1);
  await assert.rejects(() => command('send',null,{keys:[promo.id],expectedVersions:{[promo.id]:promo._version}}),/Adicione produtos/);
  const malformedBefore = await signal();
  for (const action of ['send','finalize']) await assert.rejects(() => command(action,promo.id,
    {keys:[promo.id],expectedVersions:{[promo.id]:promo._version}},promo._version),/não aceitam um registro individual/);
  assert.equal(await signal(),malformedBefore);
  assert.deepEqual(await get(promo.id),promo,'Malformed batch calls do not mutate the document or signal.');
  const beforeAdd = await signal();
  promo = await command('addProducts',promo.id,{productIds:[p1.id,p2.id]},promo._version);
  assert.equal(promo.items.length,2); assert.equal(promo._version,2); assert.equal(await signal(),beforeAdd+1);
  assert.equal(promo.items[0].productSnapshot.photo,png,'Photo snapshots are stable, not signed URLs.');
  assert.notEqual(promo.items[0].id,promo.items[1].id);
  assert.equal(promo.items[0].productSnapshot.photos,undefined,'Five legacy photos are reduced to their primary snapshot.');
  assert.equal(promo.items[0].productSnapshot.image,undefined);
  assert.equal(promo.items[1].productSnapshot.photoAssets.length,1,'Five Storage photos are reduced to one stable reference.');
  assert.equal(promo.items[1].productSnapshot.photoAssets[0].path,photoRefs[0].path);
  p2 = await rpc('sp_product_gallery',[company,p2.id,[],[],p2._version]);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[photoRefs[0].path])).rows.length,0,
    'The promotion keeps its primary Storage snapshot immutable after the product gallery changes.');
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[photoRefs[1].path])).rows.length,1,
    'Unused extra photos are not retained by promotion snapshots.');

  const snapshot = structuredClone(promo);
  for (const ids of [[p1.id],[p1.id,p1.id],[p3.id,'foreign-product']]) {
    await assert.rejects(() => command('addProducts',promo.id,{productIds:ids},promo._version));
    assert.deepEqual(await get(promo.id),snapshot,'A bad product rejects the whole batch.');
  }
  await assert.rejects(() => command('updatePromotion',promo.id,header,1),/outra sessão/);
  await assert.rejects(() => command('removeProducts',promo.id,{itemIds:[promo.items[0].id,'missing']},promo._version));
  assert.deepEqual(await get(promo.id),snapshot);
  await assert.rejects(() => command('updateProduct',promo.id,{itemId:promo.items[0].id,input:{quantity:201}},promo._version),/1 a 200/);
  await assert.rejects(() => command('saveDraft',promo.id,{input:{name:'Forjada'}},promo._version),/comandos de promoção/);
  await assert.rejects(() => command('saveDraft',null,{input:{...header,kind:'promotion',items:[]}}),/comandos de promoção/);
  await assert.rejects(() => save('price_tables',promo,promo._version),/operação de negócio/);
  await assert.rejects(() => rpc('sp_delete',[company,'products',p1.id,p1._version]),/vinculado à tabela/);
  const page = await rpc('sp_resource_page',[company,'price_tables',1,20,'Café','draft','','','','active']);
  assert.equal(page.total,1); assert.equal(page.items[0].itemCount,2); assert.equal(page.items[0].kind,'promotion');
  assert.equal(JSON.stringify(page).includes('base64'),false);
  for (const line of promo.items) promo = await command('updateProduct',promo.id,
    {itemId:line.id,input:{priceRaw:'1.234,50',templateId:template.id,quantity:'2',printLayout:'two-a4',name:'FORGED'}},promo._version);
  assert.equal(promo.items[0].cents,123450); assert.equal(promo.items[0].name,'Café');
  promo = await command('updatePromotion',promo.id,{...header,name:'Promoção revisada'},promo._version);
  const legacy = await command('saveDraft',null,{input:{productId:p1.id,templateId:template.id,priceRaw:'',quantity:'1',printLayout:'individual',start:'',end:''}});
  const beforeRollback = await signal();
  await assert.rejects(() => command('send',null,{keys:[promo.id,legacy.id],expectedVersions:{[promo.id]:promo._version,[legacy.id]:legacy._version}}));
  assert.equal((await get(promo.id)).status,'draft'); assert.equal(await signal(),beforeRollback,'Failed transition batch rolls back signals.');
  promo = (await command('send',null,{keys:[promo.id],expectedVersions:{[promo.id]:promo._version}}))[0];
  assert.equal(promo.status,'sent'); assert.equal(promo.items[0].quantity,2);
  assert.equal(promo.items[0].productSnapshot.photo,png);
  await assert.rejects(() => command('deletePromotion',promo.id,{},promo._version),/rascunhos/);
  await assert.rejects(() => command('removeProducts',promo.id,{itemIds:[promo.items[0].id]},promo._version),/rascunhos/);
  promo = await command('reopen',promo.id,{},promo._version);
  assert.equal(promo.status,'draft');
  promo = (await command('send',null,{keys:[promo.id],expectedVersions:{[promo.id]:promo._version}}))[0];
  promo = (await command('finalize',null,{keys:[promo.id],expectedVersions:{[promo.id]:promo._version}}))[0];
  assert.equal(promo.status,'finalized');
  let remove = await command('createPromotion',null,header);
  remove = await command('addProducts',remove.id,{productIds:[p1.id,p3.id]},remove._version);
  const codePage = await rpc('sp_resource_page',[company,'price_tables',1,20,'FEIJAO-003','draft','','','','active']);
  assert.equal(codePage.total,1,'Promotion search includes product codes.');
  remove = await command('removeProducts',remove.id,{itemIds:remove.items.map((i)=>i.id)},remove._version);
  assert.deepEqual(remove.items,[]);
  await assert.rejects(() => command('deletePromotion',remove.id,{},1),/outra sessão/);
  const beforeDelete = await signal();
  assert.deepEqual(await command('deletePromotion',remove.id,{},remove._version),{deleted:true});
  assert.equal(await get(remove.id),null); assert.equal(await signal(),beforeDelete+1);
  assert.equal((await db.query("select count(*) n from public.audit_log where company_id=$1 and record_id=$2 and action='delete'",[company,remove.id])).rows[0].n,1);
  assert.deepEqual(await command('deletePromotion',legacy.id,{},legacy._version),{deleted:true});
  await assert.rejects(() => rpc('sp_command',[other,'price_tables','createPromotion',null,header,null]),/não autorizado/);
  await db.exec('reset role');
  await db.query("update public.companies set name='Supermercado do Povo' where id=$1",[company]);
  const verification = read('tests/price-promotions.remote-verification.sql');
  await db.exec(verification.slice(verification.indexOf('create function pg_temp.verify_price_promotions()')));
  await db.exec('set role authenticated');
  const remoteProof = (await db.query('select pg_temp.verify_price_promotions() evidence')).rows[0].evidence;
  assert.equal(remoteProof.rolledBack,true);
  for (const field of ['pricesPreserved','productsPreserved','signalsPreserved','auditPreserved']) assert.equal(remoteProof[field],true);

  await db.exec('reset role');
  await db.query('update public.memberships set active=false where company_id=$1 and user_id=$2',[company,owner]);
  await db.exec('set role authenticated');
  await assert.rejects(() => command('createPromotion',null,header),/não autorizado/);
  await db.exec('reset role'); await db.exec('set role anon');
  await assert.rejects(() => command('createPromotion',null,header),/permission denied/);
  await db.exec('reset role');
  const privileges = (await db.query(`select
    has_function_privilege('authenticated','sp_private.price_promotion_command(uuid,text,text,jsonb,bigint)','execute') command_private,
    has_function_privilege('authenticated','sp_private.validate_price_promotion(uuid,jsonb)','execute') validator_private,
    has_function_privilege('anon','public.sp_command(uuid,text,text,text,jsonb,bigint)','execute') anon_command,
    has_table_privilege('authenticated','public.price_tables','insert,update,delete') direct_write,
    (select relrowsecurity from pg_class where oid='public.price_tables'::regclass) rls`)).rows[0];
  assert.deepEqual(privileges,{command_private:false,validator_private:false,anon_command:false,direct_write:false,rls:true});
  console.log('Price promotions: header, batch products, snapshots, transitions, deletion, concurrency, isolation and grants passed.');
} finally { await db.close(); }
