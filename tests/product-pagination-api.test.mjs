import test from'node:test';import assert from'node:assert/strict';import{createDataApi}from'../shared/data/api.js';import{createRemoteProductRepository}from'../interno/cadastros/produtos/state.js';
const context=id=>({companyId:id,user:{id:'user'},companies:[{id,role:'admin'}]});
function fixture(handler){const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:await handler(name,args),error:null};},channel(){return{on(){return this;},subscribe(){return this;}};},async removeChannel(){}};return{api:createDataApi({client}),calls};}
const page=(ids,total=83)=>({items:ids.map(id=>({id,_version:1,hasPhotos:true})),page:1,pages:5,perPage:20,total,allTotal:83,from:1,to:ids.length});
test('paged metadata does not request photos and cache includes company, page, search, category and subcategory',async()=>{
 const f=fixture(async(name,args)=>{assert.equal(name,'sp_product_page');return page(['p']);});await f.api.setContext(context('a'));
 await Promise.all([f.api.listProductPage({query:'cafe'}),f.api.listProductPage({query:'cafe'})]);assert.equal(f.calls.length,1);
 await f.api.listProductPage({query:'cafe',page:2});await f.api.listProductPage({query:'cafe',subcategory:'sub1'});assert.equal(f.calls.length,3);
 assert.equal(f.calls[0].args.p_per_page,20);assert.equal(f.calls[2].args.p_subcategory,'sub1');
 await f.api.setContext(context('b'));await f.api.listProductPage({query:'cafe'});assert.equal(f.calls.at(-1).args.p_company_id,'b');await f.api.setContext(null);
});
test('only visible primary photos are requested, four per batch with at most two parallel requests',async()=>{
 let active=0,peak=0;const batches=[],emitted=[];const f=fixture(async(name,args)=>{assert.equal(name,'sp_product_previews');batches.push(args.p_ids);peak=Math.max(peak,++active);await new Promise(resolve=>setImmediate(resolve));active--;return args.p_ids.map(id=>({id,_version:1,photos:['data:image/png;base64,AAAA'],photoAssets:[]}));});
 await f.api.setContext(context('a'));const rows=page(Array.from({length:20},(_,i)=>'p'+i)).items;
 await f.api.loadProductPreviews(rows,{onBatch:batch=>emitted.push(...batch)});assert.equal(batches.length,5);assert.ok(batches.every(batch=>batch.length<=4));assert.equal(peak,2);assert.equal(emitted.length,20);assert.ok(emitted.every(row=>row.photos.length===1));
 await f.api.loadProductPreviews(rows);assert.equal(batches.length,5,'back navigation reuses current primary-photo cache');await f.api.setContext(null);
});
test('a page change stops scheduling old photo batches and blocks stale callbacks',async()=>{
 let current=true,delivered=0;const f=fixture(async(name,args)=>{await new Promise(resolve=>setImmediate(resolve));current=false;return args.p_ids.map(id=>({id,_version:1,photos:['data:image/png;base64,AAAA']}));});await f.api.setContext(context('a'));
 await f.api.loadProductPreviews(page(Array.from({length:20},(_,i)=>'p'+i)).items,{isCurrent:()=>current,onBatch:()=>delivered++});assert.ok(f.calls.length<=2);assert.equal(delivered,0);await f.api.setContext(null);
});
test('opening a product reads one record and never requests the catalog',async()=>{
 const calls=[];const repository=createRemoteProductRepository({hydrateUnits:async()=>{},read:async()=>{throw Error('Full catalog must not load');},readOne:async(resource,id)=>{calls.push([resource,id]);return{id,photos:['data:image/png;base64,AAAA','data:image/png;base64,BBBB']};}});
 assert.equal((await repository.getProduct('one')).photos.length,2);assert.deepEqual(calls,[['products','one']]);
});
test('preview RPC cannot smuggle a full gallery into a list card',async()=>{
 const f=fixture(async()=>[{id:'p',_version:1,photos:['data:image/png;base64,AAAA','data:image/png;base64,BBBB']}]);await f.api.setContext(context('a'));await assert.rejects(()=>f.api.loadProductPreviews(page(['p']).items),/somente a foto principal/);await f.api.setContext(null);
});
test('quotation catalog metadata uses a separate cached RPC without requesting any gallery',async()=>{
 const f=fixture(async(name,args)=>{assert.equal(name,'sp_list');assert.equal(args.p_resource,'products');return[{id:'one',name:'Arroz',hasPhotos:true,_version:1}];});await f.api.setContext(context('a'));
 const first=await f.api.listProductMetadata();first[0].name='Changed locally';assert.equal((await f.api.listProductMetadata())[0].name,'Arroz');assert.equal(f.calls.length,1);await f.api.setContext(null);
});

test('multi-select uses server union filters and canonical cache keys', async () => {
 const f=fixture(async(name,args)=>{assert.equal(name,'sp_product_page_filtered');return page(['p']);});
 await f.api.setContext(context('a'));
 await f.api.listProductPage({category:['Mercearia','Bebidas'],subcategory:['s2','s1']});
 await f.api.listProductPage({category:['Bebidas','Mercearia','Bebidas'],subcategory:['s1','s2']});
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0].args.p_categories,['Bebidas','Mercearia']);
 assert.deepEqual(f.calls[0].args.p_subcategories,['s1','s2']);
 await f.api.setContext(null);
});
