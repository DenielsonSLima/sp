import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesign,createProductElement,validateDesign} from '../interno/encartes/model.js';
import {templates} from '../interno/encartes/templates.js';
import {prepareTemplateDesign,templateDesign,renderTemplateGallery} from '../interno/encartes/template-gallery.js';
import {materializeProductPhoto} from '../interno/cadastros/produtos/photo.js';
const photo='data:image/png;base64,aGVsbG8=';
const signed='https://enhoierfwuwtzulznjxa.supabase.co/storage/v1/object/sign/product-photos/company/products/product/front.png?token=approved';
function installTemplate(t,{count=2,category='Mercearia'}={}){
 const prior=[...templates],design=createDesign();
 for(let index=0;index<count;index++){const product=createProductElement({},design);product.placeholder=true;design.elements.push(product);}
 const row={id:'storage-template',name:'Modelo com fotos',description:'',category,productCount:count,definition:design};
 templates.splice(0,templates.length,row);t.after(()=>templates.splice(0,templates.length,...prior));return row;
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('production template copies only selected category Storage pixels before document validation',async t=>{
 installTemplate(t,{count:3});let copies=0;
 const catalog=[{name:'Leite',category:'Laticínios',unit:'UN',photo:'https://untrusted.test/not-selected.png'}, {name:'Bono Coco 90g',category:'Mercearia',unit:'UN',photo:signed,photos:[signed],photoAssets:[{path:'canonical'}]}],before=structuredClone(catalog);
 const design=await prepareTemplateDesign(createDesign(),'storage-template',catalog,{materialize:source=>materializeProductPhoto(source,{fetcher:async url=>{copies++;assert.equal(url,signed);return new Response(new Blob(['hello'],{type:'image/png'}));}})});
 assert.equal(copies,1);assert.deepEqual(catalog,before);
 assert.equal(design.elements.length,3);
 for(const product of design.elements){assert.equal(product.name,'Bono Coco 90g');assert.equal(product.image,photo);assert.equal(product.placeholder,false);assert.equal(product.photoAssets,undefined);}
 assert(!JSON.stringify(design).includes('token='));assert.deepEqual(validateDesign(design),design);
 assert.throws(()=>templateDesign(createDesign(),'storage-template',catalog),/Imagem inválida/);
 assert.equal(templateDesign(createDesign(),'storage-template',[{name:'Local',category:'Mercearia',unit:'UN',photo}]).elements[0].image,photo);
});

test('preview and application share safe filling and fallback pool is limited to available slots',async t=>{
 installTemplate(t,{count:1});const sources=[];
 const catalog=[{name:'Arroz',unit:'UN',photo},{name:'Outro',unit:'UN',photo:'https://untrusted.test/unused'}];
 for(const preview of [true,false]){
  const design=await prepareTemplateDesign(createDesign(),'storage-template',catalog,{preview,materialize:async source=>{sources.push(source);return source;}});
  assert.equal(design.elements[0].image,photo);assert.equal(design.elements[0].name,'Arroz');
 }
 assert.deepEqual(sources,[photo,photo]);
});

test('fetch failures reject without a partial design and stale session/navigation cancels completion',async t=>{
 const row=installTemplate(t),before=structuredClone(row);
 const catalog=[{name:'Produto',category:'Mercearia',unit:'UN',photo:signed}];
 await assert.rejects(prepareTemplateDesign(createDesign(),'storage-template',catalog,{materialize:async()=>{throw Error('Storage indisponível');}}),/Storage indisponível/);
 assert.deepEqual(row,before);
 for(const reason of ['session','navigation']){
  const waiting=deferred();let current=true;
  const result=prepareTemplateDesign(createDesign(),'storage-template',catalog,{materialize:()=>waiting.promise,isCurrent:()=>current});
  current=false;waiting.resolve(photo);
  await assert.rejects(result,error=>error.code==='STALE_GALLERY',reason);
 }
});

function fakeGallery(t){
 const prior={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const controls={};for(const selector of ['.model-blank','[name=templateSearch]','[name=templateCount]','[name=templateFormat]'])controls[selector]={disabled:false};
 const feedback={textContent:'',classList:{toggle(){}}};let buttons=[];
 const grid={set innerHTML(value){this.markup=value;buttons=[{dataset:{template:'storage-template'},disabled:false,isConnected:true,canvas:{isConnected:true,getContext(){throw Error('Canvas unavailable in DOM fixture');},replaceWith(){this.isConnected=false;}},querySelector(){return this.canvas;}}];},querySelectorAll(){return buttons;}};
 const root={isConnected:true,set innerHTML(value){this.markup=value;},querySelector(selector){return selector==='.flyer-model-grid'?grid:selector==='.flyer-model-message'?feedback:controls[selector];},querySelectorAll(){return [...buttons,...Object.values(controls)];}};
 globalThis.document={createTextNode:text=>({textContent:text})};globalThis.window=new EventTarget();
 t.after(()=>Object.assign(globalThis,prior));return {root,feedback,get button(){return buttons[0];}};
}
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};

test('gallery catches preview/network failures and allows retry; pending selection ignores double click',async t=>{
 installTemplate(t,{count:1});const env=fakeGallery(t),catalog=[{name:'Bono',category:'Mercearia',unit:'UN',photo:signed}];
 let fail=true,copies=0,chosen=0;const waiting=deferred(),opened=deferred();
 globalThis.fetch=async()=>{copies++;if(fail)throw Error('Falha de rede');await waiting.promise;return new Response(new Blob(['hello'],{type:'image/png'}));};
 const cleanup=renderTemplateGallery(env.root,{catalog,onChoose:async design=>{chosen++;assert.equal(design.elements[0].image,photo);await opened.promise;},onBlank(){}});
 t.after(cleanup);await settle();assert.match(env.feedback.textContent,/Não foi possível carregar a prévia/);
 await env.button.onclick();assert.match(env.feedback.textContent,/Falha de rede/);assert.equal(chosen,0);assert.equal(env.button.disabled,false);
 fail=false;const selecting=env.button.onclick();await env.button.onclick();assert.equal(env.button.disabled,true);
 waiting.resolve();await settle();assert.equal(chosen,1);assert.equal(copies,3);opened.resolve();await selecting;assert.equal(env.button.disabled,false);
});

test('gallery navigation while copying photos prevents the selected design from opening',async t=>{
 installTemplate(t,{count:1});const env=fakeGallery(t),waiting=deferred();let chosen=0;
 globalThis.fetch=async()=>{await waiting.promise;return new Response(new Blob(['hello'],{type:'image/png'}));};
 const cleanup=renderTemplateGallery(env.root,{catalog:[{name:'Bono',category:'Mercearia',unit:'UN',photo:signed}],onChoose(){chosen++;},onBlank(){}});
 t.after(cleanup);const selecting=env.button.onclick();window.dispatchEvent(new Event('hashchange'));waiting.resolve();await selecting;await settle();assert.equal(chosen,0);
});
