import {readDomainSource,readModuleSource} from './helpers/domain-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {defaultTemplates} from './fixtures/legacy-catalogs/modelos-cartaz/model.js';
import {planPriceTablePdfs,generatePriceTablePdfs} from '../interno/tabela-precos/pdf.js';
const entry=(change={})=>({name:'Arroz branco',unit:'kg',cents:499,start:'2026-10-20',end:'2026-10-27',templateSnapshot:defaultTemplates()[1],quantity:1,printLayout:'two-a4',...change});

test('price table groups exact snapshots and physical layouts, never just same paper',()=>{
 const a=entry(),differentId=entry(),differentSettings=entry();differentId.templateSnapshot.id='another-model';differentSettings.templateSnapshot.color='#123456';
 const reordered=entry();reordered.templateSnapshot=Object.fromEntries(Object.entries(a.templateSnapshot).reverse());
 const groups=planPriceTablePdfs([a,reordered,differentId,differentSettings,entry({printLayout:'individual'})]);
 assert.equal(groups.length,4);assert.deepEqual(groups.map(g=>g.count),[2,1,1,1]);assert.equal(groups[0].pages.length,1);assert.equal(new Set(groups.map(g=>g.name)).size,4);
 assert.match(groups[0].name,/tabela-precos-Medio-medium-two-a4-297x210/);
 assert.deepEqual(groups[0].pages[0].map(p=>p.xMm),[.25,148.75]);assert.equal(groups[3].widthMm,148);
});
test('mixed and blank validity dates consolidate while retaining per-offer validity and immutable snapshots',()=>{
 const entries=[entry(),entry({start:'2026-11-01',end:'2026-11-05'}),entry({start:'',end:'',quantity:2})],before=JSON.stringify(entries);
 const [group]=planPriceTablePdfs(entries),offers=group.pages.flat().map(p=>p.offer);
 assert.equal(group.count,4);assert.equal(group.pages.length,2);assert.deepEqual(offers.map(o=>o.start),['2026-10-20','2026-11-01','','']);
 assert.deepEqual(offers.map(o=>o.templateSnapshot.layout.validity.hidden),[false,false,true,true]);assert.equal(offers[2],offers[3]);
 assert.equal(JSON.stringify(entries),before);entries[0].templateSnapshot.headline='MUDOU';assert.equal(offers[0].templateSnapshot.headline,'OFERTA');
});
test('global copies and page caps include every model and layout',()=>{
 assert.throws(()=>planPriceTablePdfs([entry({quantity:251}),entry({quantity:250})]),/500 cartazes/);
 const different=entry({quantity:200});different.templateSnapshot.id='other';
 assert.throws(()=>planPriceTablePdfs([entry({quantity:202}),different]),/200 páginas/);
 assert.equal(planPriceTablePdfs([entry({quantity:400})])[0].pages.length,200);
 // Odd counts in different model groups must not share a sheet.
 const singles=Array.from({length:201},(_,i)=>entry({templateSnapshot:{...defaultTemplates()[1],id:`model-${i}`}}));
 assert.throws(()=>planPriceTablePdfs(singles),/200 páginas/);
});
test('invalid prices, units, quantities, validity and layouts fail before rendering',()=>{
 for(const change of [{cents:0},{cents:1.5},{unit:'cx'},{quantity:0},{quantity:1.5},{start:'',end:'2026-10-20'},{start:'2026-02-30'},{end:'2026-10-19'},{printLayout:'rotate'},{templateSnapshot:null}])assert.throws(()=>planPriceTablePdfs([entry(change)]));
 assert.throws(()=>planPriceTablePdfs([]),/Selecione/);assert.throws(()=>planPriceTablePdfs([entry({templateSnapshot:defaultTemplates()[2]})]),/não cabe/);
});
test('export uses shared rendering, per-offer text and PDF previews with no automatic print/download',async()=>{
 const oldDocument=globalThis.document,oldBitmap=globalThis.createImageBitmap,draws=[];
 const context={fillRect(){},strokeRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},drawImage(){},measureText:t=>({width:t.length*10}),fillText:t=>draws.push(t)};
 globalThis.document={createElement:()=>({getContext:()=>context,toBlob:cb=>cb(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}))})};globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const results=await generatePriceTablePdfs([entry(),entry({start:'2026-11-01',end:'2026-11-05'}),entry({start:'',end:''})],{includePreviews:true});
  assert.equal(results.length,1);assert.equal(results[0].pages,2);assert.equal(results[0].previewPages.length,2);
  const pdf=await results[0].blob.text();assert.match(pdf,/%PDF-1.4/);assert.match(pdf,/\/MediaBox \[0 0 841\.88976 595\.27559\]/);
  assert.ok(draws.some(t=>t.includes('20/10/2026')));assert.ok(draws.some(t=>t.includes('01/11/2026')));assert.equal(draws.filter(t=>t.startsWith('Válido')).length,2);
  const source=await readModuleSource('interno/tabela-precos/pdf.js');assert.match(source,/openPdfDialog\(host/);assert.doesNotMatch(source,/\.click\(|\.print\(|createObjectURL/);
 }finally{globalThis.document=oldDocument;globalThis.createImageBitmap=oldBitmap;}
});
test('real Canvas batch exports parse and rasterize with separate model files and consolidated dates',{skip:!process.env.CANVAS_MODULE_PATH},async()=>{
 const {createCanvas,loadImage}=await import(process.env.CANVAS_MODULE_PATH),oldDocument=globalThis.document,oldBitmap=globalThis.createImageBitmap,dir=await mkdtemp(join(tmpdir(),'price-table-pdf-'));
 globalThis.createImageBitmap=async blob=>loadImage(new Uint8Array(await blob.arrayBuffer()));
 globalThis.document={createElement(){const canvas=createCanvas(1,1);canvas.toBlob=cb=>cb(new Blob([canvas.toBuffer('image/jpeg')],{type:'image/jpeg'}));return canvas;}};
 try{
  const other=entry({printLayout:'individual'});other.templateSnapshot.id='different';
  const results=await generatePriceTablePdfs([entry(),entry({start:'2026-11-01',end:'2026-11-05'}),entry({start:'',end:''}),other],{includePreviews:true});assert.equal(results.length,2);
  for(const [i,result] of results.entries()){
   const path=join(dir,`${i}.pdf`);await writeFile(path,new Uint8Array(await result.blob.arrayBuffer()));
   const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});assert.match(info,new RegExp(`Pages:\\s+${result.pages}`));assert.match(info,/PDF version:\s+1.4/);
   assert.match(info,i===0?/Page size:\s+841\.89 x 595\.276 pts/:/Page size:\s+419\.528 x 595\.276 pts/);
   execFileSync('pdftoppm',['-scale-to','300','-png',path,join(dir,`render-${i}`)]);
   assert.equal(result.previewPages.length,result.pages);for(const preview of result.previewPages){const image=await loadImage(new Uint8Array(await preview.arrayBuffer()));assert.equal(Math.max(image.width,image.height),1200);}
  }
 }finally{globalThis.document=oldDocument;globalThis.createImageBitmap=oldBitmap;await rm(dir,{recursive:true,force:true});}
});
