import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataApi} from '../shared/data/api.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(handler){
 const calls=[],channels=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return handler(name,args);},
  channel(){const channel={on(){return this;},subscribe(callback){this.callback=callback;return this;}};channels.push(channel);return channel;},
  async removeChannel(){},
 };
 const api=createDataApi({client});
 return {api,calls,channels,client};
}
const context=id=>({companyId:id,user:{id:'user'},companies:[{id,name:'Empresa',role:'admin'}]});

test('a stalled PNG read times out through the API and an explicit retry can load it', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 let reads=0;
 const {api}=fixture(()=>++reads===1?new Promise(()=>{}):{data:{id:'seal',dataURL:'pixels',_version:4}});
 await api.setContext(context('a'));
 const first=api.getRecord('brand_assets','seal');
 const rejected=assert.rejects(first,{name:'TimeoutError'});
 await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(20_000);
 await rejected;
 assert.equal((await api.getRecord('brand_assets','seal')).dataURL,'pixels');
 assert.equal(reads,2);
 await api.setContext(null);
});

test('a stalled save is reconciled once and never replayed automatically', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 const {api,calls}=fixture(name=>name==='sp_flyer_save'?new Promise(()=>{}):{data:null});
 await api.setContext(context('a'));
 const saving=api.saveFlyerSnapshot({id:'art',elements:[]},{expectedVersion:4});
 const rejected=assert.rejects(saving,{name:'TimeoutError'});
 await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(120_000);
 await rejected;
 assert.deepEqual(calls.map(call=>call.name),['sp_flyer_save','sp_get']);
 assert.equal(api.queryClient.getQueryData(['sp','a','flyers','detail','art']),undefined);
 await api.setContext(null);
});

test('brand folders read compact metadata and retrieve a full PNG only by an individual RPC',async()=>{
 const {api,calls}=fixture(async(name,args)=>({data:name==='sp_brand_asset_metadata'?[{id:'logo',name:'Logo',category:'Logos',width:100,height:40,_version:1}]:{id:args.p_id,name:'Logo',dataURL:'data:image/png;base64,AAAA',_version:1},error:null}));
 await api.setContext(context('a'));
 const rows=await api.listRecords('brand_assets');assert.equal(rows[0].dataURL,undefined);assert.equal(calls[0].name,'sp_brand_asset_metadata');assert.deepEqual(calls[0].args,{p_company_id:'a'});
 const full=await api.getRecord('brand_assets','logo');assert.equal(full.dataURL,'data:image/png;base64,AAAA');assert.equal(calls[1].name,'sp_get');assert.equal(calls[1].args.p_resource,'brand_assets');await api.setContext(null);
});

test('cache é isolado por empresa e rejeita respostas de uma sessão anterior',async()=>{
 const pending=deferred();let current='a';
 const {api}=fixture(async()=>current==='a'?pending.promise:{data:[{id:'b-product'}],error:null});
 await api.setContext(context('a'));
 const old=api.listRecords('products');await Promise.resolve();
 await api.setContext(context('b'));current='b';
 pending.resolve({data:[{id:'a-product'}],error:null});
 await assert.rejects(old,/sessão mudou|CancelledError/);
 assert.deepEqual((await api.listRecords('products')).map(row=>row.id),['b-product']);
 await api.setContext(null);
});

test('consultas simultâneas compartilham a requisição e cópias não alteram o cache',async()=>{
 const {api,calls}=fixture(async()=>({data:[{id:'unit',name:'Unidade'}],error:null}));
 await api.setContext(context('a'));
 const [first,second]=await Promise.all([api.listRecords('units'),api.listRecords('units')]);
 first[0].name='Alterado';
 assert.equal(second[0].name,'Unidade');assert.equal((await api.listRecords('units'))[0].name,'Unidade');
 assert.equal(calls.length,1);await api.setContext(null);
});

test('mutações enviam versão e erros RPC não viram gravações locais',async()=>{
 const {api,calls}=fixture(async()=>({data:null,error:{code:'40001',message:'Conflito de versão'}}));
 await api.setContext(context('a'));
 await assert.rejects(api.saveRecord('products',{id:'p',name:'Novo',_version:7}),/Conflito/);
 assert.deepEqual(calls[0].args,{p_company_id:'a',p_resource:'products',p_record:{id:'p',name:'Novo',_version:7},p_expected_version:7});
 assert.equal(api.queryClient.getQueryData(['sp','a','products']),undefined);await api.setContext(null);
});

test('logout impede contexto atrasado de restaurar autorização',async()=>{
 const pending=deferred();const {api,channels}=fixture(()=>pending.promise);
 const loading=api.loadContext();await api.setContext(null);
 pending.resolve({data:{user:{id:'u'},companies:[{id:'a'}],companyId:'a'},error:null});
 await assert.rejects(loading,/sessão mudou/);assert.equal(api.getDataContext(),null);assert.equal(channels.length,0);
});

test('logout durante invalidação impede retorno de registro da empresa anterior',async()=>{
 const pending=deferred();const {api}=fixture(async()=>({data:{id:'p',_version:2},error:null}));
 await api.setContext(context('a'));
 api.queryClient.invalidateQueries=()=>pending.promise;
 const saving=api.saveRecord('products',{id:'p',_version:1});await new Promise(resolve=>setImmediate(resolve));
 await api.setContext(null);pending.resolve();
 await assert.rejects(saving,/sessão mudou/);
});

test('fotos são lidas em lotes de até quatro e reutilizadas pela versão do produto',async()=>{
 const rows=Array.from({length:9},(_,index)=>({id:`p${index}`,_version:1,hasPhotos:true}));
 const batches=[];let active=0,peak=0;
 const {api}=fixture(async(name,args)=>{
  if(name==='sp_list')return {data:rows,error:null};
  assert.equal(name,'sp_product_media');batches.push(args.p_ids);peak=Math.max(peak,++active);
  await new Promise(resolve=>setImmediate(resolve));active--;
  return {data:args.p_ids.map(id=>({id,_version:1,photos:[`data:image/png;base64,${id}`]})),error:null};
 });
 await api.setContext(context('a'));
 const products=await api.listRecords('products');
 assert.equal(products.length,9);assert.equal(products[0].photo,products[0].photos[0]);assert.equal(products[0].image,products[0].photo);
 assert.equal(batches.length,3);assert.ok(batches.every(batch=>batch.length<=4));assert.ok(peak<=2);
 await api.listRecords('products',{force:true});assert.equal(batches.length,3,'metadados relidos não repetem download de mídia sem nova versão');
 await api.setContext(null);
});

test('flyer library metadata shares a lightweight company query and invalidates with flyers',async()=>{
 let version=1;
 const {api,calls}=fixture(async name=>({data:name==='sp_flyer_library'?[{id:'art',title:'Arte',_version:version}]:null,error:null}));
 await api.setContext(context('a'));
 const [first,second]=await Promise.all([api.listFlyerLibrary(),api.listFlyerLibrary()]);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'sp_flyer_library');assert.deepEqual(calls[0].args,{p_company_id:'a'});
 first[0].title='changed';assert.equal(second[0].title,'Arte');
 version=2;await api.invalidate('flyers');assert.equal((await api.listFlyerLibrary())[0]._version,2);assert.equal(calls.length,2);await api.setContext(null);
});

test('flyer writes merge a compact server acknowledgement without rereading every embedded image',async()=>{
 const acknowledgement={id:'art',_version:8,createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-02T03:00:00Z'};
 const {api,calls}=fixture(async()=>({data:acknowledgement,error:null}));
 await api.setContext(context('a'));
 const record={id:'art',title:'Arte',_version:7,elements:[{id:'photo',src:'data:image/png;base64,AAAA'}],guides:{x:[540],y:[960]}};
 let changes=0;const stop=api.subscribeResource('flyers',()=>{changes++;});
 const saved=await api.saveFlyerSnapshot(record);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'sp_flyer_save');
 assert.deepEqual(calls[0].args,{p_company_id:'a',p_record:record,p_expected_version:7});
 assert.deepEqual(saved,{...record,...acknowledgement});assert.equal(changes,1);
 saved.elements[0].src='changed';assert.equal(record.elements[0].src,'data:image/png;base64,AAAA');
 stop();await api.setContext(null);
});

test('a compact flyer save completed after changing company never updates the next company',async()=>{
 const pending=deferred();const {api}=fixture(()=>pending.promise);
 await api.setContext(context('old'));
 const saving=api.saveFlyerSnapshot({id:'art',elements:[]},{expectedVersion:3});
 await api.setContext(context('new'));
 pending.resolve({data:{id:'art',_version:4},error:null});
 await assert.rejects(saving,/sessão mudou/);await api.setContext(null);
});

test('confirmed flyer saves invalidate active readers without waiting for another image download', async()=>{
 const {QueryObserver}=await import('@tanstack/query-core');
 const {api}=fixture(async()=>({data:{id:'art',_version:2},error:null}));
 await api.setContext(context('a'));
 const key=['sp','a','flyers','detail','art'];
 api.queryClient.setQueryData(key,{id:'art',_version:1});
 let downloads=0;
 const held=deferred();
 const observer=new QueryObserver(api.queryClient,{queryKey:key,staleTime:Infinity,
  queryFn:()=>{downloads++;return held.promise;}});
 const stop=observer.subscribe(()=>{});
 try {
  const result=await api.saveFlyerSnapshot({id:'art',elements:[],_version:1});
  assert.equal(result._version,2);
  assert.equal(downloads,0,'saving must not refetch full image documents');
  assert.equal(api.queryClient.getQueryState(key).isInvalidated,true);
 } finally {held.resolve(null);stop();observer.destroy();await api.setContext(null);}
});

test('a lost flyer acknowledgement is reconciled by a fresh read without replaying the write',async()=>{
 const record={id:'art',title:'Arte',elements:[{src:'data:image/png;base64,AAAA'}],_version:2};
 const {api,calls}=fixture(async name=>name==='sp_flyer_save'
  ?{data:null,error:{message:'AbortError: Fetch is aborted',code:''}}
  :{data:{...record,_version:3},error:null});
 await api.setContext(context('a'));
 assert.equal((await api.saveFlyerSnapshot(record))._version,3);
 assert.deepEqual(calls.map(c=>c.name),['sp_flyer_save','sp_get']);
 await api.setContext(null);
});
test('uncertain saves never accept a different remote document as success',async()=>{
 const {api}=fixture(async name=>name==='sp_flyer_save'
  ?{data:null,error:{message:'AbortError: Fetch is aborted',code:''}}
  :{data:{id:'art',title:'Different',elements:[],_version:3},error:null});
 await api.setContext(context('a'));
 await assert.rejects(api.saveFlyerSnapshot({id:'art',elements:[],_version:2}),/Fetch is aborted/);
 await api.setContext(null);
});
test('compact flyer save sends image references while returning a complete editor document',async()=>{
 const {api,calls}=fixture(async()=>({data:{id:'art',_version:3},error:null}));
 await api.setContext(context('a'));
 const record={id:'art',elements:[{src:'data:image/png;base64,AAAA'}],_version:2};
 const saved=await api.saveFlyerSnapshot(record,{previous:record});
 assert.equal(calls[0].name,'sp_flyer_save_delta');
 assert.equal(calls[0].args.p_record.elements[0].src,undefined);
 assert.equal(saved.elements[0].src,record.elements[0].src);
 await api.setContext(null);
});

test('winner acknowledgement seeds detail cache without waiting for active list queries', async () => {
 const { QueryObserver } = await import('@tanstack/query-core');
 const record = { id: 'quote', _version: 2, awards: { item: 'provider' }, computed: { selectedTotal: 1111 } };
 const { api, calls } = fixture(async () => ({ data: record, error: null }));
 await api.setContext(context('a'));
 const detail = ['sp', 'a', 'quotes', 'detail', 'quote'];
 const list = ['sp', 'a', 'quotes'];
 api.queryClient.setQueryData(detail, { id: 'quote', _version: 1 });
 api.queryClient.setQueryData(list, []);
 let downloads = 0, notified = 0;
 const held = deferred();
 const observers = [detail, list].map(queryKey => new QueryObserver(api.queryClient, {
  queryKey, staleTime: Infinity, queryFn: () => { downloads++; return held.promise; },
 }));
 const stops = observers.map(observer => observer.subscribe(() => {}));
 const unwatch = api.subscribeResource('quotes', () => { notified++; });
 try {
  const result = await api.command('quotes', 'chooseProvider', 'quote', { itemId: 'item', providerId: 'provider' }, { expectedVersion: 1 });
  assert.equal(result._version, 2);
  assert.equal(downloads, 0);
  assert.equal(notified, 1);
  assert.equal(api.queryClient.getQueryState(list).isInvalidated, true);
  assert.equal(api.queryClient.getQueryState(detail).isInvalidated, false);
  assert.deepEqual(await api.getRecord('quotes', 'quote'), record);
  assert.equal(calls.length, 1, 'no second RPC is needed to display the committed winner');
  assert.equal(calls[0].args.p_expected_version, 1);
  result.awards.item = 'edited';
  assert.equal(api.queryClient.getQueryData(detail).awards.item, 'provider');
 } finally { held.resolve(null); stops.forEach(stop => stop()); observers.forEach(observer => observer.destroy()); unwatch(); await api.setContext(null); }
});

test('winner cache rejects earlier detail responses and remains isolated after logout', async () => {
 const held = deferred();
 const { api } = fixture(async name => name === 'sp_get' ? held.promise : { data: { id: 'q', _version: 2, awards: { i: 'p' } }, error: null });
 await api.setContext(context('a'));
 const earlier = api.getRecord('quotes', 'q').catch(() => null);
 await api.command('quotes', 'chooseProvider', 'q', {}, { expectedVersion: 1 });
 held.resolve({ data: { id: 'q', _version: 1, awards: {} }, error: null });
 await earlier;
 assert.equal((await api.getRecord('quotes', 'q'))._version, 2);
 await api.setContext(null);
 assert.equal(api.queryClient.getQueryData(['sp', 'a', 'quotes', 'detail', 'q']), undefined);
});
