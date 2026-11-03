import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {createHortifrutiRepository} from './fixtures/legacy-operations/hortifruti-state.js';import {lineInput} from './fixtures/legacy-operations/hortifruti-model.js';import {safeOrderSnapshot,safeLineSnapshot} from './fixtures/legacy-operations/hortifruti-safe-snapshot.js';import {createAutosaveQueue} from '../interno/hortifruti/autosave.js';import {batchPricingItems} from '../interno/hortifruti/pricing-batch.js';import {defaultTemplates} from './fixtures/legacy-catalogs/modelos-cartaz/model.js';globalThis.crypto??=webcrypto;
const catalog={partners:[{id:'s',name:'Parceiro'}],products:[{id:'p',name:'Tomate',unit:'KG',category:'Hortifruti'}],units:[{id:'KG',symbol:'KG'}]};function setup(){const store=createHortifrutiRepository();let record=store.create({partnerId:'s',date:'2026-10-20'},catalog);record=store.addProducts(record.id,['p'],catalog);record=store.update(record.id,{partnerId:'s',date:record.date,items:[{productId:'p',quantity:'30',total:'150',basis:'total'}]},catalog);return {store,record,draft:{partnerId:'s',date:record.date,notes:'',items:record.items.map(lineInput)}};}
test('autosave debounce flush uses latest keystroke once before navigation or PDF',()=>{const values=[],queue=createAutosaveQueue(value=>{values.push(value);return value;},10000);queue.schedule('a','old');queue.schedule('a','latest');assert.equal(queue.pending('a'),true);assert.equal(queue.flush('a'),'latest');assert.deepEqual(values,['latest']);assert.equal(queue.pending('a'),false);queue.flushAll();assert.deepEqual(values,['latest']);});
test('current invalid cost becomes blank, valid weight and notes save, raw is retained',()=>{const {store,record,draft}=setup();draft.items[0].total='invalid';draft.items[0].quantity='40';draft.notes='Atualizado';const result=store.autosave(record.id,draft,catalog);assert.ok(result.errors.length);assert.equal(result.record.items[0].quantityMicros,40000000);assert.equal(result.record.items[0].totalCents,null);assert.equal(result.record.items[0].unitMicros,null);assert.equal(result.record.notes,'Atualizado');assert.equal(draft.items[0].total,'invalid');assert.equal(safeOrderSnapshot(result.record,draft,catalog.partners).snapshot.items[0].totalCents,null);});
test('invalid weight does not export old weight or discard known fixed total',()=>{const {record,draft}=setup();draft.items[0].quantity='0';const {snapshot,errors}=safeOrderSnapshot(record,draft,catalog.partners);assert.ok(errors.length);assert.equal(snapshot.items[0].quantityMicros,null);assert.equal(snapshot.items[0].unitMicros,null);assert.equal(snapshot.items[0].totalCents,15000);assert.equal(record.items[0].quantityMicros,30000000);});
test('invalid current header renders blank in report, valid fields save independently',()=>{const {store,record,draft}=setup();draft.date='invalid';draft.partnerId='';draft.notes='Nova nota';store.autosave(record.id,draft,catalog);const {snapshot}=safeOrderSnapshot(store.get(record.id),draft,catalog.partners);assert.equal(snapshot.date,'');assert.equal(snapshot.partner.name,'');assert.equal(snapshot.notes,'Nova nota');});
test('partial boxes blank total weight; fixed total retained; inactive quantity ignored',()=>{const a=safeLineSnapshot({weighMode:'boxes',boxes:['10','invalid'],total:'150',basis:'total',quantity:'invalid'});assert.equal(a.line.quantityMicros,null);assert.equal(a.line.totalCents,15000);assert.equal(a.line.unitMicros,null);const b=safeLineSnapshot({weighMode:'boxes',boxes:['10','20'],total:'150',basis:'total',quantity:'invalid'});assert.equal(b.line.quantityMicros,30000000);assert.equal(b.errors.length,0);});
test('finalized purchase rejects autosave while sales pricing stays editable',()=>{const {store,record,draft}=setup();store.finalize(record.id,{confirmed:true});assert.throws(()=>store.autosave(record.id,draft,catalog));assert.equal(store.setPricing(record.id,'p',{salePriceCents:599}).items[0].pricing.salePriceCents,599);});
const items=()=>['a','b','c'].map(productId=>({productId,totalCents:15000,quantityMicros:30000000,pricing:{salePriceCents:699,posterQuantity:1,printLayout:'individual',templateSnapshot:defaultTemplates()[0]}}));
test('batch touches selected print settings only and does not mutate source or prices',()=>{const source=items();const result=batchPricingItems(source,['a','c'],{posterQuantity:3});assert.deepEqual(result.map(x=>x.pricing.posterQuantity),[3,1,3]);assert.deepEqual(source.map(x=>x.pricing.posterQuantity),[1,1,1]);for(const item of result){assert.equal(item.totalCents,15000);assert.equal(item.pricing.salePriceCents,699);}});
test('batch is atomic for invalid quantity, selection, empty patch and page cap',()=>{const source=items(),before=structuredClone(source);assert.throws(()=>batchPricingItems(source,['a'],{posterQuantity:0}));assert.throws(()=>batchPricingItems(source,['missing'],{posterQuantity:2}));assert.throws(()=>batchPricingItems(source,['a'],{}));assert.throws(()=>batchPricingItems(source,['a','b','c'],{posterQuantity:100}),/200 páginas/);assert.deepEqual(source,before);});
test('safe snapshot preserves partner identity snapshot even when catalog renamed or removed',()=>{const {record,draft}=setup();assert.equal(safeOrderSnapshot(record,draft,[{id:'s',name:'Renamed'}]).snapshot.partner.name,'Parceiro');const missing=safeOrderSnapshot(record,draft,[]);assert.equal(missing.snapshot.partner.name,'Parceiro');assert.equal(missing.errors.length,0);});
test('fixed purchase total stays fixed when autosaved late box changes kg and unit cost',()=>{const {store,record,draft}=setup();draft.items[0]={...draft.items[0],weighMode:'boxes',previousWeight:'30',boxes:['10']};const saved=store.autosave(record.id,draft,catalog).record.items[0];assert.equal(saved.quantityMicros,40000000);assert.equal(saved.unitMicros,3750000);assert.equal(saved.totalCents,15000);});


test('flush waits for an in-flight RPC acknowledgement and only then reports success',async()=>{
 let resolveSave;const notifications=[];const remote=new Promise(resolve=>{resolveSave=resolve;});
 const queue=createAutosaveQueue(()=>remote,100000);
 queue.schedule('order',{notes:'Nova observação'},(error,result)=>notifications.push({error,result}));
 const first=queue.flush('order'),second=queue.flush('order');
 assert.equal(first,second);assert.equal(queue.pending('order'),true);assert.deepEqual(notifications,[]);
 resolveSave({record:{id:'order',_version:2},errors:[]});await second;
 assert.equal(queue.pending('order'),false);assert.equal(notifications.length,1);assert.equal(notifications[0].result.record._version,2);
});

test('changing session cancels scheduled autosaves and ignores late acknowledgement callbacks',async()=>{
 let release,calls=0;const notifications=[];
 const queue=createAutosaveQueue(()=>{calls++;return new Promise(resolve=>{release=resolve;});},100000);
 queue.schedule('order',{notes:'Old session'},(...args)=>notifications.push(args));
 const pending=queue.flush('order');queue.schedule('queued',{notes:'Must not save'});queue.reset();
 assert.equal(queue.pending('order'),false);assert.equal(queue.pending('queued'),false);assert.equal(queue.flush('queued'),null);
 release({record:{id:'order'},errors:[]});await pending;
 assert.equal(calls,1);assert.deepEqual(notifications,[]);
});

test('slow autosave coalesces pending edits into the latest payload with at most one RPC active', async () => {
  const calls = [], notifications = [];
  let active = 0, maximum = 0;
  const queue = createAutosaveQueue((payload) => {
    active++;
    maximum = Math.max(maximum, active);
    return new Promise((resolve) => calls.push({ payload, resolve: (value) => { active--; resolve(value); } }));
  }, 100000);
  queue.schedule('r', 'first', () => notifications.push('first'));
  const first = queue.flush('r');
  queue.schedule('r', 'intermediate', () => notifications.push('intermediate'));
  queue.flush('r');
  queue.schedule('r', 'latest', () => notifications.push('latest'));
  const drained = queue.flush('r');
  assert.equal(first, drained);
  assert.deepEqual(calls.map((call) => call.payload), ['first']);
  calls[0].resolve('first saved');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.map((call) => call.payload), ['first', 'latest']);
  assert.deepEqual(notifications, [], 'older acknowledgements do not mark the newest draft saved');
  calls[1].resolve('latest saved');
  assert.equal(await drained, 'latest saved');
  assert.equal(maximum, 1);
  assert.deepEqual(notifications, ['latest']);
  assert.equal(queue.pending('r'), false);
});

test('failed old save still drains the latest edit and cancelled scheduled edits never write', async () => {
  const calls = [], notifications = [];
  const queue = createAutosaveQueue((payload) => new Promise((resolve, reject) => calls.push({ payload, resolve, reject })), 100000);
  queue.schedule('r', 'bad', (error) => notifications.push(error));
  const drained = queue.flush('r');
  queue.schedule('r', 'corrected', (error, value) => notifications.push(error || value));
  queue.flush('r');
  calls[0].reject(Error('Invalid earlier value'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[1].payload, 'corrected');
  calls[1].resolve('saved');
  await drained;
  assert.deepEqual(notifications, ['saved']);
  queue.schedule('deleted-product', 'never');
  queue.cancel('deleted-product');
  assert.equal(queue.flush('deleted-product'), null);
  assert.equal(calls.length, 2);
});
