import test from 'node:test';
import assert from 'node:assert/strict';
import {scenes} from '../interno/encartes/scene-catalog.js';
import {availableScenes,prepareSceneDesign,sceneFilterOptions} from '../interno/encartes/scene-gallery.js';
import {createDesign,createProductElement,validateDesign} from '../interno/encartes/model.js';
import {templates} from '../interno/encartes/templates.js';
import {prepareTemplateDesign} from '../interno/encartes/template-gallery.js';
import {createCatalogPhotoLoader} from '../interno/encartes/editor.js';
const webp='data:image/webp;base64,aGVsbG8=',png='data:image/png;base64,aGVsbG8=';
const catalogFor=scene=>scene.products.map((reference,index)=>({id:'live-product-'+index,code:reference.key,name:reference.name,category:'Mercearia',unit:'UN',_version:1,hasPhotos:true}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('scene availability uses active catalog identifiers, requires every combination item and applies theme/search filters',()=>{
 const scene=scenes.find(scene=>scene.products.length>1),catalog=catalogFor(scene),before=structuredClone(catalog);
 assert.equal(availableScenes([]).length,0);
 assert(availableScenes(catalog).some(row=>row.id===scene.id));
 assert(!availableScenes(catalog.slice(1)).some(row=>row.id===scene.id));
 assert(!availableScenes(catalog.map(product=>({...product,id:'unrelated',code:'unrelated'}))).some(row=>row.id===scene.id),'same marketing names cannot substitute missing catalog entries');
 const asIds=catalog.map((product,index)=>({...product,id:scene.products[index].key,code:''}));assert(availableScenes(asIds).some(row=>row.id===scene.id));
 assert(availableScenes(catalog,{collection:scene.collection,query:scene.title.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}).some(row=>row.id===scene.id));
 assert.equal(availableScenes(catalog,{theme:'outro-tema'}).length,0);assert.equal(availableScenes(catalog,{collection:'ausente'}).length,0);assert.deepEqual(catalog,before);
});

test('opening a scene embeds one full Story background with editable current product descriptions and price fields',async()=>{
 const scene=scenes[0],catalog=catalogFor(scene),before=structuredClone(catalog);let reads=0;
 const design=await prepareSceneDesign(scene.id,catalog,{readImage:async source=>{reads++;assert.equal(source,scene.src);return webp;}});
 assert.equal(reads,1);assert.equal(design.width,1080);assert.equal(design.height,1920);assert.equal(design.status,'draft');
 assert.equal(design.elements.filter(element=>element.type==='image').length,1);
 assert.deepEqual({...design.elements[0],id:''},{id:'',type:'image',x:0,y:0,width:1080,height:1920,locked:true,rotation:0,flipX:false,flipY:false,opacity:1,hidden:false,label:'Cenário Natal · '+scene.title,templatePart:false,src:webp,fit:'cover'});
 for(const product of catalog){
  const fields=design.elements.filter(element=>element.offerProductId===product.id);
  assert.equal(fields.find(element=>element.offerField==='name')?.text,product.name);
  assert.equal(fields.find(element=>element.offerField==='price')?.text,'R$ —,—');
  assert(fields.every(element=>element.type==='text'&&!element.locked&&!element.hidden));
 }
 assert(!design.elements.some(element=>element.type==='product'),'the static photo cannot acquire a second replaceable product image');
 assert(!JSON.stringify(design).includes('token='));assert.deepEqual(catalog,before);
});

test('one to four scene products receive distinct editable fields with current names, real prices and persisted offer identity',async()=>{
 for(const count of [1,2,3,4]){
  const scene=scenes.find(scene=>scene.products.length===count),catalog=catalogFor(scene);
  assert(scene,`Missing ${count}-product fixture`);
  catalog.forEach((product,index)=>Object.assign(product,{name:`Descrição atual ${index+1} · 500 g`,unit:index?'UN':'KG',...(index===0?{priceCents:12345}:index===1?{priceText:'R$ 8,79'}:{})}));
  const before=structuredClone(catalog);
  const design=await prepareSceneDesign(scene.id,catalog,{readImage:async()=>webp});
  const offers=design.elements.filter(element=>element.offerField);
  assert.equal(offers.length,count*2);
  assert.equal(new Set(offers.map(element=>element.offerProductId)).size,count);
  assert.equal(new Set(design.elements.map(element=>element.id)).size,design.elements.length);
  for(const [index,product] of catalog.entries()){
   const field=key=>offers.find(element=>element.offerProductId===product.id&&element.offerField===key);
   assert.equal(field('name').text,product.name);
   assert.equal(field('price').text,index===0?'R$ 123,45':index===1?'R$ 8,79':'R$ —,—');
   assert(field('price').priceBadge.unit.length>0);
   field('name').text='Descrição livre na arte';field('price').text='R$ 11,90';
  }
  const restored=validateDesign(JSON.parse(JSON.stringify(design)));
  assert.deepEqual(restored.elements.filter(element=>element.offerField),offers,'editable identity and values survive save/load validation');
  assert.deepEqual(catalog,before,'editing artwork never writes into catalog data');
  for(const element of restored.elements){
   assert(element.x>=0&&element.y>=0&&element.x+element.width<=1080&&element.y+element.height<=1920);
  }
 }
});

test('scene fields use the latest matching catalog data when metadata changes while the photograph loads',async()=>{
 const scene=scenes[0],catalog=catalogFor(scene),waiting=deferred();
 const opening=prepareSceneDesign(scene.id,catalog,{readImage:()=>waiting.promise});
 catalog[0]={...catalog[0],name:'Descrição atualizada durante o carregamento',priceCents:2199,unit:'KG',_version:2};
 waiting.resolve(webp);
 const design=await opening,fields=design.elements.filter(element=>element.offerProductId===catalog[0].id);
 assert.equal(fields.find(element=>element.offerField==='name').text,catalog[0].name);
 assert.equal(fields.find(element=>element.offerField==='price').text,'R$ 21,99');
});

test('scene creation rejects missing products, failed image reads, temporary URLs and stale results',async()=>{
 const scene=scenes[0],catalog=catalogFor(scene);let reads=0;
 await assert.rejects(prepareSceneDesign(scene.id,[],{readImage:async()=>{reads++;return webp;}}),/não está disponível/);assert.equal(reads,0);
 await assert.rejects(prepareSceneDesign('unknown',catalog,{readImage:async()=>webp}),/não está disponível/);
 await assert.rejects(prepareSceneDesign(scene.id,catalog,{readImage:async()=>{throw Error('Arquivo indisponível');}}),/Arquivo indisponível/);
 await assert.rejects(prepareSceneDesign(scene.id,catalog,{readImage:async()=>scene.src}),/incorporada/);
 const waiting=deferred();let current=true;
 const opening=prepareSceneDesign(scene.id,catalog,{readImage:()=>waiting.promise,isCurrent:()=>current});current=false;waiting.resolve(webp);await assert.rejects(opening,/sessão ou a galeria mudou/);
 const changed=deferred(),mutable=catalogFor(scene),openingChanged=prepareSceneDesign(scene.id,mutable,{readImage:()=>changed.promise});mutable.splice(0);changed.resolve(webp);await assert.rejects(openingChanged,/produtos deste cenário mudaram/);
});

function templateFixture(t,count=2,category='Mercearia'){
 const prior=[...templates],definition=createDesign();for(let index=0;index<count;index++)definition.elements.push({...createProductElement({},definition),placeholder:true});
 const template={id:'resolved-template',name:'Fotos sob demanda',category,definition};templates.splice(0,templates.length,template);t.after(()=>templates.splice(0,templates.length,...prior));return template;
}

test('template photo resolver loads only products that fill actual slots, after category preference',async t=>{
 const template=templateFixture(t),resolved=[],materialized=[];
 const catalog=[{id:'unrelated',name:'Outro setor',category:'Bebidas',unit:'UN'},{id:'a',name:'Primeiro',category:'Mercearia',unit:'UN'},{id:'b',name:'Segundo',category:'Mercearia',unit:'UN'},{id:'unused',name:'Não cabe no modelo',category:'Mercearia',unit:'UN'}];
 const design=await prepareTemplateDesign(createDesign(),template.id,catalog,{resolvePhoto:async product=>{resolved.push(product.id);return 'signed-'+product.id;},materialize:async source=>{materialized.push(source);return png;}});
 assert.deepEqual(resolved,['a','b']);assert.deepEqual(materialized,['signed-a','signed-b']);assert.deepEqual(design.elements.filter(element=>element.type==='product').map(element=>element.name),['Primeiro','Segundo']);
});

test('models with no slots or no production category do not resolve photos; canceled resolver cannot materialize',async t=>{
 const template=templateFixture(t,0);let reads=0;
 await prepareTemplateDesign(createDesign(),template.id,[{id:'a',category:'Mercearia'}],{preview:true,resolvePhoto:()=>{reads++;return png;}});assert.equal(reads,0);
 template.category='';await prepareTemplateDesign(createDesign(),template.id,[{id:'a'}],{resolvePhoto:()=>{reads++;return png;}});assert.equal(reads,0);
 template.category='Mercearia';template.definition.elements.push({...createProductElement({},template.definition),placeholder:true});let current=true,materialized=0;const waiting=deferred();
 const pending=prepareTemplateDesign(createDesign(),template.id,[{id:'a',category:'Mercearia'}],{isCurrent:()=>current,resolvePhoto:()=>waiting.promise,materialize:async()=>{materialized++;return png;}});current=false;waiting.resolve('signed-a');await assert.rejects(pending,error=>error.code==='STALE_GALLERY');assert.equal(materialized,0);
});

test('catalog primary-photo loader deduplicates requests and caps picker/template work at two concurrent loads',async()=>{
 const jobs=[];let active=0,maxActive=0;
 const load=createCatalogPhotoLoader({loadPreviews:async([product],options)=>{const waiting=deferred();jobs.push({product,waiting});active++;maxActive=Math.max(maxActive,active);await waiting.promise;active--;options.onBatch([{...product,photo:png}]);}});
 const products=Array.from({length:6},(_,index)=>({id:'p'+index,_version:1})),pending=products.map(load);
 assert.equal(load(products[0]),pending[0]);assert.equal(jobs.length,2);
 for(let index=0;index<products.length;index++){assert(jobs[index]);jobs[index].waiting.resolve();await settle();}
 assert.deepEqual(await Promise.all(pending),Array(6).fill(png));assert.equal(maxActive,2);assert.equal(jobs.length,6);
});

test('photo queue invalidation rejects active/queued old results and cannot evict a newer same-product request',async()=>{
 const jobs=[];const load=createCatalogPhotoLoader({loadPreviews:async([product],options)=>{const waiting=deferred();jobs.push({product,waiting});await waiting.promise;options.onBatch([{...product,photo:png}]);}});
 const product={id:'same',_version:1},old=load(product),other=load({id:'other',_version:1}),queued=load({id:'queued',_version:1});const rejected=Promise.allSettled([old,other,queued]);
 load.clear();const fresh=load(product);jobs[0].waiting.resolve();await settle();assert.equal(jobs.length,3);assert.equal(load(product),fresh,'old failed promise must not delete newer cache entry');
 jobs[1].waiting.resolve();jobs[2].waiting.resolve();assert.equal(await fresh,png);assert((await rejected).every(result=>result.status==='rejected'));
});

test('photo loader expires signed sources and retries failed loads without returning blank success',async()=>{
 let timestamp=0,calls=0,fail=true,current=true;
 const load=createCatalogPhotoLoader({now:()=>timestamp,isCurrent:()=>current,loadPreviews:async([product],options)=>{calls++;if(fail)throw Error('Preview unavailable');options.onBatch([{...product,photo:png}]);}}),product={id:'retry',_version:1};
 await assert.rejects(load(product),/Preview unavailable/);fail=false;assert.equal(await load(product),png);assert.equal(calls,2);await load(product);assert.equal(calls,2);timestamp=600001;await load(product);assert.equal(calls,3);current=false;await assert.rejects(load(product),/sessão mudou/);assert.equal(calls,3);
});

test('scene category and subcategory filters must match the same live product in a combination',()=>{
 const scene=scenes.find(scene=>scene.products.length>1),catalog=catalogFor(scene);
 catalog.forEach((product,index)=>Object.assign(product,{category:index?'Laticínios':'Mercearia',subcategoryId:index?'leites':'biscoitos',subcategory:index?'Leites':'Biscoitos'}));
 const has=filters=>availableScenes(catalog,filters).some(row=>row.id===scene.id);
 assert(has({category:'Mercearia',subcategory:'biscoitos'}));
 assert(has({category:'Laticínios',subcategory:'leites'}));
 assert(!has({category:'Mercearia',subcategory:'leites'}));
 assert(!has({subcategory:'inexistente'}));
 assert(has({query:'NATALINA',category:'Mercearia'}));
 assert(has({query:catalog[0].code.toLowerCase()}));
 catalog[0].name='Nome atualizado no cadastro';assert(has({query:'atualizado no cadastro'}));
 assert(!availableScenes(catalog.slice(1),{subcategory:'leites'}).some(row=>row.id===scene.id));
});

test('gallery filter options deduplicate subcategory IDs and restrict them to the chosen product category',()=>{
 const catalog=[{category:'Mercearia',subcategoryId:'coffee',subcategory:'Café'},{category:'Mercearia',subcategoryId:'coffee',subcategory:'Café'},{category:'Laticínios',subcategoryId:'milk',subcategory:'Leites'},{category:'Mercearia'}];
 assert.deepEqual(sceneFilterOptions(catalog).categories,['Laticínios','Mercearia']);
 assert.equal(sceneFilterOptions(catalog).subcategories.length,2);
 assert.deepEqual(sceneFilterOptions(catalog,'Mercearia').subcategories,[{id:'coffee',name:'Café'}]);
 assert.deepEqual(sceneFilterOptions(catalog,'ausente').subcategories,[]);
 assert.deepEqual(sceneFilterOptions([]),{categories:[],subcategories:[]});
});
