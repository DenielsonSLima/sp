import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesign,createTextElement,createProductElement,duplicateElement,validateDesign,createHistory} from '../interno/encartes/model.js';
import {templates,applyTemplate} from '../interno/encartes/templates.js';
import {exportDesignJson,parseDesignJson,saveDesign} from '../interno/encartes/storage.js';
const raster = 'data:image/png;base64,aGVsbG8=';
test('design defaults and dimension limits', () => {
  assert.equal(createDesign().width,1080);
  for (const dimensions of [{width:0},{height:Infinity},{width:4096,height:4096},{width:320.5}]) assert.throws(() => createDesign(dimensions));
  assert.equal(createDesign({width:4096,height:320}).width,4096);
});
test('validation clamps geometry, strips unknown fields, sanitizes colors and fonts', () => {
  const d = createDesign(), e = createTextElement(d);
  d.elements.push({...e,x:-10,y:2000,width:2000,color:'url(https://evil.test)',fontFamily:'unsafe',onclick:'bad'});
  const clean = validateDesign(d).elements[0];
  assert.equal(clean.x,0); assert.equal(clean.width,1080); assert.ok(clean.y + clean.height <= d.height); assert.equal(clean.fontFamily,'Arial'); assert.equal(clean.color,'#242424'); assert.equal(clean.onclick,undefined);
  d.elements[0].x = NaN; assert.throws(() => validateDesign(d));
});
test('image validation permits local raster and logo only', () => {
  const d = createDesign(), product = createProductElement({name:'Arroz',photo:raster,unit:'kg'},d);
  assert.equal(product.image,raster); assert.equal(product.placeholder,false);
  for (const src of ['https://example.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)','../secret.png','data:image/png;base64,??']) {
    assert.throws(() => validateDesign({...d,elements:[{...product,image:src}]}));
  }
  assert.equal(validateDesign({...d,elements:[{...product,image:'./assets/logo-original.jpg'}]}).elements[0].image,'./assets/logo-original.jpg');
  assert.throws(() => validateDesign({...d,elements:[{...product,image:'data:image/png;base64,' + 'a'.repeat(12 * 1024 * 1024)}]}));
});
test('history snapshots are independent, branch correctly and cap at 50', () => {
  const d = createDesign(), h = createHistory(d); d.title = 'mutated'; assert.equal(h.current().title,'Nova arte');
  const read = h.current(); read.title = 'changed'; assert.equal(h.current().title,'Nova arte');
  h.commit({...d,title:'one'}); h.commit({...d,title:'two'}); assert.equal(h.undo().title,'one'); assert.equal(h.redo().title,'two');
  h.undo(); h.commit({...d,title:'branch'}); assert.equal(h.canRedo(),false);
  for (let i=0;i<70;i++) h.commit({...d,title:String(i)});
  let count=0; while(h.canUndo()) {h.undo();count++;} assert.equal(count,49);
});
test('duplicate is a separate element and product metadata survives validation', () => {
  const d = createDesign(), p = createProductElement({name:'Leite',unit:'un',priceCents:499},d), copy = duplicateElement(p);
  assert.notEqual(p.id,copy.id); copy.name='Other'; assert.equal(p.name,'Leite');
  assert.equal(validateDesign({...d,elements:[p]}).elements[0].priceCents,499);
});
test('all templates fit portrait, landscape, square and extreme artboards', () => {
  for (const [width,height] of [[1080,1080],[1080,1920],[1920,1080],[320,4096],[4096,320]]) {
    for (const template of templates) {
      const d = applyTemplate(createDesign({width,height}),template.id);
      const products = d.elements.filter(e=>e.type==='product'); assert.equal(products.length,template.productCount); assert.ok(products.every(p=>p.placeholder));
      for (const e of d.elements) {assert.ok(e.x>=0 && e.y>=0 && e.width>0 && e.height>0); assert.ok(e.x+e.width<=width+.0001 && e.y+e.height<=height+.0001);}
      for(let a=0;a<products.length;a++) for(let b=a+1;b<products.length;b++) {
        const p=products[a],q=products[b]; assert.ok(p.x+p.width<=q.x+.001 || q.x+q.width<=p.x+.001 || p.y+p.height<=q.y+.001 || q.y+q.height<=p.y+.001);
      }
    }
  }
});
test('template preserves existing products, text and standalone images', () => {
  const d = createDesign(); const p = {...createProductElement({name:'Arroz',photo:raster,unit:'kg'},d),priceText:'7,99',priceCents:799};
  d.elements = [p,{...createTextElement(d),text:'Minha chamada'},{id:'photo',type:'image',src:raster,x:10,y:10,width:50,height:50}];
  const first=applyTemplate(d,templates[3].id), second=applyTemplate(first,templates[0].id);
  assert.equal(second.elements.filter(e=>e.type==='product').length,1);
  assert.equal(second.elements.find(e=>e.id===p.id).image,raster); assert.equal(second.elements.find(e=>e.id===p.id).priceText,'7,99');
  assert.ok(second.elements.some(e=>e.text==='Minha chamada')); assert.ok(second.elements.some(e=>e.id==='photo'));
});
test('JSON backups validate, create fresh IDs and cannot overwrite an imported original', () => {
  const d = createDesign(); d.status='created'; const restored = parseDesignJson(exportDesignJson(d));
  assert.notEqual(restored.id,d.id); assert.equal(restored.status,'draft'); assert.equal(restored.title,d.title);
  assert.throws(()=>parseDesignJson('{')); assert.throws(()=>parseDesignJson('{"elements":[],"width":99999}'));
});
test('storage absence is explicit and never claims a successful save', async () => {
  if (!globalThis.indexedDB) await assert.rejects(saveDesign(createDesign()),/Armazenamento local indisponível/);
});
test('save waits for transaction completion, and rejects a later transaction abort', async () => {
  const previous = globalThis.indexedDB;
  let activeTransaction;
  const db = {onversionchange:null,close(){},transaction(){
    const request = {};
    const tx = {objectStore:()=>({put:()=>{queueMicrotask(()=>request.onsuccess?.());return request;}})};
    activeTransaction = tx; return tx;
  }};
  globalThis.indexedDB = {open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
  try {
    let settled = false;
    const saving=saveDesign(createDesign()).then(value=>{settled=true;return value;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(settled,false); activeTransaction.oncomplete(); assert.ok((await saving).id);
    const failing=saveDesign(createDesign());
    await new Promise(resolve=>setImmediate(resolve));
    activeTransaction.error = {name:'QuotaExceededError'};
    activeTransaction.onabort(); await assert.rejects(failing,/Espaço local insuficiente/);
  } finally { db.onversionchange?.(); if(previous===undefined) delete globalThis.indexedDB; else globalThis.indexedDB=previous; }
});
test('template switching preserves custom shapes without accumulating template bands',()=>{const d=createDesign();d.elements.push({id:'custom',type:'shape',x:10,y:10,width:50,height:50,fill:'#123456'});const first=applyTemplate(d,'offers-4');const next=applyTemplate(first,'offers-6');assert(next.elements.some(e=>e.id==='custom'));assert.equal(next.elements.filter(e=>e.templatePart).length,3);});
