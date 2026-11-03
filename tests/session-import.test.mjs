import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateSourceManifest,validateImportUniqueness,prepareSessionImport,projectRef,companyId} from '../scripts/prepare-session-import.mjs';
import {validatePreparedManifest,selectImportProduct,createReviewedImporter} from '../scripts/session-import-runner.js';
const source=()=>({projectRef,companyId,products:[{code:'CAT-TEST',name:'Produto Teste 1kg',category:'Mercearia',subcategory:'Básicos',unit:'UN',photos:['front','left','right'].map(angle=>({file:'/tmp/'+angle+'.png',angle,source:'generated'}))}],assets:[]});
const prepared=()=>({projectRef,companyId,products:[{...validateSourceManifest(source()).products[0],photos:['front','left','right'].map((angle,index)=>({url:'./files/'+String(index+1).repeat(64)+'.png',sha256:String(index+1).repeat(64),size:100,width:1024,height:1024,angle,source:'generated'}))}],assets:[]});

test('source review rejects wrong scope, unclassified products, prices and duplicate views',()=>{
 for(const mutate of [v=>v.companyId='other',v=>v.products[0].subcategory='',v=>v.products[0].priceCents=100,v=>v.products[0].photos[2].angle='front',v=>v.products[0].name='x'.repeat(101)]){const input=source();mutate(input);assert.throws(()=>validateSourceManifest(input));}
 const validated=validateSourceManifest(source());assert.match(validated.products[0].id,/^reviewed-product-[a-f0-9]{24}$/);assert.equal(validateSourceManifest(source()).products[0].id,validated.products[0].id);
 const existing=source();existing.products[0].code=' cat-test ';assert.equal(validateSourceManifest(existing).products[0].id,validated.products[0].id);
 const duplicate={products:[...validated.products,{...validated.products[0],code:' cat-test '}],assets:[]};assert.throws(()=>validateImportUniqueness(duplicate),/Código.*repetido/);
});

test('prepared review accepts only hash-addressed local files and unique exact three views',()=>{
 assert.equal(validatePreparedManifest(prepared()).products.length,1);
 for(const mutate of [v=>v.products[0].photos[0].url='https://example.test/photo.png',v=>v.products[0].photos[0].sha256='bad',v=>v.products[0].photos[1].sha256=v.products[0].photos[0].sha256,v=>v.products[0].photos[0].width=512,v=>v.products[0].photos[0].size=9*1024*1024,v=>v.products.push({...v.products[0]})]){const value=prepared();mutate(value);assert.throws(()=>validatePreparedManifest(value));}
});

test('existing catalog entries are preserved; only deterministic unedited import IDs resume',()=>{
 const input=prepared().products[0],existing={...input,id:'manual-id'};
 assert.equal(selectImportProduct(input,[existing]).action,'preserve');
 assert.equal(selectImportProduct(input,[{...existing,code:'different'}]).action,'preserve');
 assert.equal(selectImportProduct(input,[]).action,'create');
 assert.equal(selectImportProduct(input,[{...input,_version:1}]).action,'resume');
 assert.equal(selectImportProduct(input,[{...input,name:'Usuário editou'}]).action,'preserve');
 assert.throws(()=>selectImportProduct(input,[existing,{...existing,id:'second-id'}]),/duplicados/);
});

function fakeApi(){
 const rows={products:[],product_categories:[{id:'main',name:'Mercearia'},{id:'sub',name:'Básicos',parentId:'main'}],brand_categories:[{id:'natal',name:'Natal'}],brand_assets:[]};let uploaded=0,savedGalleries=0,failSecondUpload=true,failGalleryResponse=false,productWrites=0;
 const value={rows,get uploaded(){return uploaded;},get savedGalleries(){return savedGalleries;},get productWrites(){return productWrites;},set failSecondUpload(value){failSecondUpload=value;},set failGalleryResponse(value){failGalleryResponse=value;},data:{
  queryClient:{removeQueries(){}},
  async listProductMetadata(){return structuredClone(rows.products);},async listRecords(resource){return structuredClone(rows[resource]);},async getRecord(resource,id){return structuredClone(rows[resource].find(row=>row.id===id)??null);},
  async saveRecord(resource,input){if(resource==='products')productWrites++;const row={...structuredClone(input),_version:1};rows[resource].push(row);return structuredClone(row);},
  async uploadProductPhoto(id,source){uploaded++;if(failSecondUpload&&uploaded===2)throw Error('Network upload failed');return {bucket:'product-photos',path:id+'/'+uploaded+'.png',mimeType:'image/png',size:100};},
  async saveProductGallery(id,{photoAssets}){savedGalleries++;const row=rows.products.find(row=>row.id===id);row.photoAssets=structuredClone(photoAssets);row._version++;if(failGalleryResponse)throw Error('Response lost after commit');return structuredClone(row);}
 }};return value;
}
const verifyPhotos=async(row,input)=>{assert.equal(row.photoAssets.length,3);assert.equal(row.subcategoryId,'sub');assert.deepEqual(row.photoAssets.map(photo=>photo.angle),input.photos.map(photo=>photo.angle));};

test('retry resumes partial uploads in memory and does not recreate or overwrite product metadata',async()=>{
 const input=prepared().products[0],fake=fakeApi(),importer=createReviewedImporter({data:fake.data,readData:async photo=>photo.sha256,verifyPhotos});
 await assert.rejects(importer.product(input),/Network upload failed/);assert.equal(fake.productWrites,1);assert.equal(fake.uploaded,2);assert.equal(fake.savedGalleries,0);
 fake.failSecondUpload=false;const done=await importer.product(input);assert.equal(done.sha256Verified,true);assert.equal(fake.productWrites,1);assert.equal(fake.uploaded,4);assert.equal(fake.savedGalleries,1);
 await importer.product(input);assert.equal(fake.uploaded,4);assert.equal(fake.savedGalleries,1);assert.equal(fake.productWrites,1);
});

test('ambiguous gallery save response reconciles by read-back; stale sessions stop before further writes',async()=>{
 const input=prepared().products[0],fake=fakeApi();fake.failSecondUpload=false;fake.failGalleryResponse=true;
 const importer=createReviewedImporter({data:fake.data,readData:async photo=>photo.sha256,verifyPhotos});
 const done=await importer.product(input);assert.equal(done.sha256Verified,true);assert.equal(fake.savedGalleries,1);
 const before=fake.productWrites+fake.uploaded+fake.savedGalleries;
 const stale=createReviewedImporter({data:fake.data,assertCurrent:()=>{throw Error('Sessão alterada');}});
 await assert.rejects(stale.product(input),/Sessão alterada/);assert.equal(fake.productWrites+fake.uploaded+fake.savedGalleries,before);
});

test('preserving existing product skips all category, metadata and photo mutations',async()=>{
 const input=prepared().products[0],fake=fakeApi();fake.rows.products.push({...input,id:'registered-existing'});
 const importer=createReviewedImporter({data:fake.data,readData:()=>{throw Error('Must not load photos');}});
 const result=await importer.product(input);assert.equal(result.preserved,true);assert.equal(fake.productWrites,0);assert.equal(fake.uploaded,0);assert.equal(fake.savedGalleries,0);
});

test('real library manifest prepares nine hash-checked PNGs with stable IDs in an isolated directory',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'povo-reviewed-test-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const output=await prepareSessionImport(['assets/biblioteca/manifest.json'],{destination:folder});assert.equal(output.assets,9);assert.equal(output.products,0);
 const manifest=validatePreparedManifest(JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8')));assert.equal(manifest.assets[0].id,'povo-logo-transparente-v1');
 const duplicate=source();duplicate.products.push({...duplicate.products[0]});const sourceFile=path.join(folder,'duplicate.json');await writeFile(sourceFile,JSON.stringify(duplicate));await assert.rejects(prepareSessionImport([sourceFile],{destination:folder}),/repetido/);
 assert.equal(JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8')).assets.length,9,'rejected preparation keeps prior review plan');
});
