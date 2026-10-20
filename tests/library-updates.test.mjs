import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const asset={id:'asset-1',name:'Original',category:'Logos',width:1,height:1,dataURL:'data:image/png;base64,AAAA'};
test('stale asset update rejects inside transaction rather than recreating a deleted PNG',async()=>{
 const original=globalThis.indexedDB,rows=new Map([[asset.id,{...asset}]]);let puts=0;
 const db={transaction(names,mode){assert.deepEqual(names,['assets','categories']);assert.equal(mode,'readwrite');let pending=0,aborted=false;
  const tx={abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(name){
   const request=operation=>{pending++;const req={};queueMicrotask(()=>{if(aborted)return;req.result=operation();req.onsuccess?.();pending--;if(!pending)queueMicrotask(()=>{if(!aborted&&!pending)tx.oncomplete?.();});});return req;};
   return name==='categories'?{get:name=>request(()=>name==='Logos'?{name}:undefined)}:{get:id=>request(()=>rows.get(id)),put:value=>request(()=>{puts++;rows.set(value.id,{...value});return value.id;})};
  }};return tx;
 }};
 globalThis.indexedDB={open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess();});return req;}};
 try{
  const {updateAsset}=await import('../interno/cadastros/biblioteca-marca/storage.js?stale-update-test');
  await updateAsset({...asset,name:'Edited'});assert.equal(puts,1);assert.equal(rows.get(asset.id).name,'Edited');
  rows.delete(asset.id);await assert.rejects(updateAsset({...asset,name:'Stale modal'}),/excluído em outra aba/);assert.equal(puts,1);assert.equal(rows.has(asset.id),false);
 }finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});
test('failed asset edit retains open dialog and raw form inputs with an inline accessible error',async()=>{
 const source=await readFile(new URL('../interno/cadastros/biblioteca-marca/index.js',import.meta.url),'utf8');
 assert.match(source,/class="brand-edit-status" role="status" aria-live="polite"/);
 const handler=source.split('form.onsubmit=async')[1].split("q('.brand-confirm-delete')")[0];
 const error=handler.split('catch(error)')[1];assert.match(error,/brand-edit-status/);assert.doesNotMatch(error,/dialog.close|form.reset|\.value=/);
});
