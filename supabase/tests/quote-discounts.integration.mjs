import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite(), owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rpc = async (name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of ['schema.sql','catalog-schema.sql','migrations/20261031031813_optimize_product_media_rpc.sql','migrations/20261031032723_product_photo_storage.sql','migrations/20261031043008_product_server_pagination.sql','migrations/20261031050550_quote_header_creation.sql','migrations/20261031054608_partner_company_details.sql','migrations/20261102013854_quote_supplier_discounts.sql','migrations/20261102031736_quote_offer_history.sql'])
    await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  if(process.env.POVO_QUOTE_APPLY_SCRIPT){
    await db.exec('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
    const script=readFileSync(process.env.POVO_QUOTE_APPLY_SCRIPT,'utf8');await db.exec(script);await db.exec(script);
    assert.equal((await db.query("select count(*)::int total from supabase_migrations.schema_migrations where version='20261102013854'")).rows[0].total,1);
  }
  await db.query('insert into auth.users values($1,$2)',[owner,'discount@example.com']);
  const company=(await db.query("select sp_private.bootstrap_company('discount@example.com','Loja') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
  const save=(resource,record)=>rpc('sp_save',[company,resource,record,null]);
  await save('product_categories',{id:'foods',name:'Mercearia'});
  for(const id of ['p1','p2','p3']) await save('products',{id,name:id,category:'Mercearia',unit:'UN',photos:[]});
  for(const id of ['a','b']) await save('partners',{id,name:id,type:'Fornecedor'});
  let q=await rpc('sp_command',[company,'quotes','create',null,{title:'Descontos',date:'2026-11-01'},null]);
  const act=(action,payload={})=>rpc('sp_command',[company,'quotes',action,q.id,payload,q._version]);
  for(const id of ['a','b']) q=await act('addQuoteProvider',{provider:{id}});
  for(const [productId,quantity] of [['p1','2'],['p2','1.5'],['p3','1']]) q=await act('addQuoteItem',{product:{id:productId},quantity});
  const [i1,i2,i3]=q.items.map(i=>i.id);
  for(const [itemId,providerId,value] of [[i1,'a','10'],[i2,'a','3.34'],[i3,'b','0.01']]) {
    q=await act('setOffer',{itemId,providerId,value});q=await act('chooseProvider',{itemId,providerId});
  }
  const discount=(providerId,itemId,type,value)=>act('setQuoteDiscount',{providerId,itemId,type,value});
  const browserFixture={before:structuredClone(q)};
  const initialRevision=(await db.query("select revision from public.resource_changes where company_id=$1 and resource='quotes'",[company])).rows[0].revision;
  q=await discount('a',i1,'percent','10');browserFixture.item=structuredClone(q);
  q=await discount('a',i2,'amount','0.01');browserFixture.items=structuredClone(q);
  q=await discount('a',null,'amount','3.01');browserFixture.general=structuredClone(q);
  if(process.env.POVO_QUOTE_FIXTURE)writeFileSync(process.env.POVO_QUOTE_FIXTURE,JSON.stringify(browserFixture));
  let a=q.computed.awardedByProvider[0];
  assert.equal(a.grossTotal,2501);assert.equal(a.itemDiscountTotal,201);assert.equal(a.subtotal,2300);assert.equal(a.discountTotal,301);assert.equal(a.total,1999);
  assert.equal(a.items[0].grossTotal,2000);assert.equal(a.items[0].discountTotal,200);assert.equal(a.items[0].total,1800);
  assert.equal(q.computed.selectedTotal,2000);assert.equal(q.computed.totals[0].subtotal,2501,'quoted proposal remains gross');
  assert.equal(q.computed.lineTotals[i1].a,2000);assert.equal(q.computed.discountsSupported,true);
  q=await discount('a',null,'percent','10');assert.equal(q.computed.awardedByProvider[0].total,2070);
  await assert.rejects(()=>discount('a',null,'percent','100.01'),/100/);
  await assert.rejects(()=>discount('a',null,'amount','23.01'),/superar/);
  await assert.rejects(()=>discount('a',i1,'amount','20.01'),/superar/);
  await assert.rejects(()=>discount('a',i1,'unknown','1'),/Tipo/);
  await assert.rejects(()=>discount('a',i1,'amount','-1'),/positivo/);
  await assert.rejects(()=>discount('a',i3,'amount','0.01'),/Escolha/);
  await assert.rejects(()=>discount('foreign',i1,'amount','1'),/Fornecedor inválido/);
  await assert.rejects(()=>rpc('sp_command',[company,'quotes','setQuoteDiscount',q.id,{providerId:'a',type:'amount',value:'1'},1]),/outra sessão/);
  await assert.rejects(()=>rpc('sp_command',['cccccccc-cccc-4ccc-8ccc-cccccccccccc','quotes','setQuoteDiscount',q.id,{providerId:'a',type:'amount',value:'1'},q._version]),/não autorizado/);
  q=await discount('b',i3,'percent','100');assert.equal(q.computed.awardedByProvider[1].total,0);
  q=await discount('a',i1,'percent','0,00');assert.equal(q.computed.awardedByProvider[0].items[0].discountTotal,0);
  q=await discount('a',null,'amount','');assert.equal(q.computed.awardedByProvider[0].discountTotal,0);
  q=await discount('a',i1,'percent','10');q=await discount('a',null,'amount','3.01');
  q=await act('finalizeQuoteProvider',{providerId:'a'});const snapshot=structuredClone(q.finalizedProviders.a);
  assert.equal(snapshot.total,1999);assert.equal(snapshot.items[0].discountTotal,200);
  await assert.rejects(()=>discount('a',null,'amount','1'),/finalizado/);
  q=await discount('b',i3,'percent','50');assert.deepEqual(q.finalizedProviders.a,snapshot);assert.equal(q.computed.awardedByProvider[0].total,1999);
  q=await act('finalizeQuote');assert.equal(q.status,'finished');assert.equal(q.computed.selectedTotal,1999);
  assert.equal((await rpc('sp_get',[company,'quotes',q.id])).finalizedProviders.a.total,1999);
  await assert.rejects(()=>discount('b',null,'amount','0'),/aberta/);
  assert.ok((await db.query("select revision from public.resource_changes where company_id=$1 and resource='quotes'",[company])).rows[0].revision>initialRevision);
  await assert.rejects(()=>db.query("update public.quotes set data='{}' where company_id=$1",[company]),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select has_function_privilege('anon','public.sp_command(uuid,text,text,text,jsonb,bigint)','execute') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','sp_private.quote_discount_amount(numeric,jsonb)','execute') ok")).rows[0].ok,false);
  await db.exec('set role anon');await assert.rejects(()=>discount('a',null,'amount','1'),/permission denied/);
  console.log('PASS: per-item and per-supplier R$/% discounts, cent rounding, gross proposals, zero-net lines, clear/retry, immutable finalization, viewed versions, authorization, grants and resource_changes.');
} catch(error) {console.error(error.message,error.where||'',error.code||'');process.exitCode=1;} finally {await db.close();}
