import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceDesignProduct} from '../interno/encartes/product-replacement.js';
import {materializeProductPhoto} from '../interno/cadastros/produtos/photo.js';
import {createDesign,createProductElement,validateDesign} from '../interno/encartes/model.js';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const source='https://enhoierfwuwtzulznjxa.supabase.co/storage/v1/object/sign/product-photos/company/products/product/front.png?token=temporary';
function fixture(){
 const design=createDesign(),item=createProductElement({name:'Anterior',unit:'UN'},design);
 design.elements.push(item,{id:'linked-name',type:'text',x:0,y:0,width:200,height:40,text:'Anterior',linkedProductId:item.id,linkedField:'name'});
 return {design,item};
}
test('replacing an artwork product copies authorized PNG bytes instead of persisting its temporary URL',async()=>{
 const {design,item}=fixture(),before=structuredClone(design);let calls=0;
 const materialize=value=>materializeProductPhoto(value,{fetcher:async url=>{calls++;assert.equal(url,source);return new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png'}});}});
 const result=await replaceDesignProduct(design,item.id,{name:'Novo produto',unit:'KG',photo:source},{materialize});
 const replaced=result.elements.find(element=>element.id===item.id);
 assert.equal(replaced.image,`data:image/png;base64,${png}`);
 assert.equal(Buffer.from(replaced.image.split(',')[1],'base64')[25],6,'the PNG alpha color type is preserved byte for byte');
 assert.equal(replaced.unit,'kg');assert.equal(result.elements.find(element=>element.id==='linked-name').text,'Novo produto');
 assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('token='),false);assert.deepEqual(design,before);
 assert.deepEqual(validateDesign(result),result);
});
test('a changed company or design while the replacement photo loads cannot commit the stale result',async()=>{
 for(const change of ['company','design','revision','element']){
  const {design,item}=fixture(),before=structuredClone(design);let release,current=true;
  const pending=new Promise(resolve=>release=resolve);
  const replacing=replaceDesignProduct(design,item.id,{name:'Novo',unit:'UN',photo:source},{materialize:async()=>{await pending;return `data:image/png;base64,${png}`;},isCurrent:()=>current});
  current=false;release();await assert.rejects(replacing,/arte mudou/,change);assert.deepEqual(design,before);
 }
});
test('failed downloads and locked elements preserve the existing artwork',async()=>{
 const {design,item}=fixture(),before=structuredClone(design);
 await assert.rejects(replaceDesignProduct(design,item.id,{name:'Novo',photo:source},{materialize:async()=>{throw Error('download failed');}}),/download failed/);
 assert.deepEqual(design,before);item.locked=true;
 await assert.rejects(replaceDesignProduct(design,item.id,{name:'Novo',photo:''}),/não está disponível/);
 assert.equal(design.elements[0].name,'Anterior');
});
