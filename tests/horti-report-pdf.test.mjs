import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {reportMoney,reportDecimal,normalizeReportOrder,generateOrderReportPdfs} from '../interno/hortifruti/report-pdf.js';
const item=()=>({productId:'p',name:'Tomate italiano',unitSymbol:'KG',unitCount:4,quantityMicros:12500000,unitMicros:3333333,totalCents:4167});
const order=()=>({id:'compra-1',date:'2026-10-20',partner:{name:'Horta São José'},status:'pending',notes:'Entregar pela manhã.\nConferir as caixas.',items:[item()]});
test('report exact monetary precision, nullable costs and local calendar date',()=>{
 assert.equal(reportMoney(4167),'R$ 41,67');assert.equal(reportMoney(null),'');assert.equal(reportDecimal(null),'');assert.equal(reportDecimal(3333333,6,2),'3,333333');assert.equal(reportDecimal(12500000),'12,5');assert.equal(reportMoney(123456789),'R$ 1.234.567,89');
 const o=order();o.items.push({...item(),quantityMicros:null,unitMicros:null,totalCents:null});const normalized=normalizeReportOrder(o);assert.equal(normalized.totalCents,4167);assert.equal(normalized.incomplete,1);assert.equal(normalized.date,'2026-10-20');
 o.items=[{...item(),quantityMicros:null,unitMicros:null,totalCents:null}];assert.equal(normalizeReportOrder(o).totalCents,null);
});
test('report quantity uses actual box count or manual units and keeps missing snapshot values blank',()=>{
 const o=order();o.items=[
  {...item(),weighMode:'boxes',boxes:[5000000,null,7500000],unitCount:99,boxesIncomplete:true},
  {...item(),weighMode:'total',boxes:[1000000,2000000],unitCount:7},
  {...item(),weighMode:'boxes',boxes:[],unitCount:99,previousWeightMicros:12500000},
  {...item(),unitCount:null,quantityMicros:null,unitMicros:null,totalCents:null}
 ];
 const result=normalizeReportOrder(o);
 assert.deepEqual(result.items.map(i=>i.reportQuantity),[3,7,null,null]);
 assert.deepEqual([result.items[3].quantityMicros,result.items[3].unitMicros,result.items[3].totalCents],[null,null,null]);
 assert.equal(result.totalCents,12501);assert.equal(result.incomplete,2);
 assert.equal(reportMoney(0),'R$ 0,00');assert.equal(reportDecimal(0),'0');
});
test('report validation rejects invalid dates, unsafe values, empty items and wrong units',()=>{
 assert.throws(()=>normalizeReportOrder({...order(),date:'2026-02-30'}),/data/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[]}),/produtos/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[{...item(),unitSymbol:'UN'}]}),/kg/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[{...item(),totalCents:1.1}]}),/Total/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[{...item(),quantityMicros:-1}]}),/Peso/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[{...item(),unitCount:-1}]}),/Quantidade/);
 assert.throws(()=>normalizeReportOrder({...order(),items:[{...item(),totalCents:Number.MAX_SAFE_INTEGER},{...item(),totalCents:1}]}),/limite/);
});
test('report paginates with repeated headers, blank missing values, wrapped notes and matching raster previews',async()=>{
 const original=globalThis.document,oldBitmap=globalThis.createImageBitmap,texts=[];
 const jpeg=new Uint8Array([255,216,255,217]);
 const context={fillRect(){},drawImage(){},measureText:t=>({width:t.length*11}),fillText(t){texts.push(t)}};
 globalThis.document={createElement(){return{getContext:()=>context,toBlob:cb=>cb(new Blob([jpeg],{type:'image/jpeg'}))}}};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const o=order();o.items=Array.from({length:80},(_,i)=>({...item(),name:`Produto ${i} com descrição longa para quebrar linha e conferir dados`,...(i===0?{quantityMicros:null,unitMicros:null,totalCents:null}:{})}));
  const [result]=await generateOrderReportPdfs(o);assert.ok(result.pages>1);assert.equal(result.previewPages.length,result.pages);assert.equal(result.blob.type,'application/pdf');
  const pdf=await result.blob.text();assert.match(pdf,/%PDF-1.4/);assert.match(pdf,/595\.27559 841\.88976/);assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,result.pages);
  assert.equal(texts.filter(t=>t==='HORTIFRUTI · RELATÓRIO DE COMPRA').length,result.pages);assert.ok(texts.some(t=>t.includes('20/10/2026')));assert.ok(!texts.includes('—'));assert.ok(texts.includes(''));assert.ok(texts.includes('SUBTOTAL PARCIAL'));for(const title of ['PRODUTO','QUANTIDADE','PESO (kg)','VALOR UNIT. (kg)','VALOR TOTAL'])assert.equal(texts.filter(t=>t===title).length,result.pages);assert.ok(texts.includes('Conferir as caixas.'));
 }finally{globalThis.document=original;globalThis.createImageBitmap=oldBitmap;}
});
test('all unknown values and subtotal render blank, while known subtotal is labelled normally',async()=>{
 const original=globalThis.document,oldBitmap=globalThis.createImageBitmap,texts=[];
 const context={fillRect(){},drawImage(){},measureText:t=>({width:t.length*11}),fillText(t){texts.push(t)}};
 globalThis.document={createElement(){return{getContext:()=>context,toBlob:cb=>cb(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}))}}};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const o=order();o.date='';o.partner={id:'',name:''};o.items=[{...item(),unitCount:null,quantityMicros:null,unitMicros:null,totalCents:null}];
  const [blankHeader]=await generateOrderReportPdfs(o);assert.equal(blankHeader.name,'hortifruti-compra-1.pdf');assert.ok(texts.includes('Parceiro: '));assert.ok(texts.includes('Data:   ·  Pendente'));
  const start=texts.indexOf('Tomate italiano');assert.deepEqual(texts.slice(start+1,start+5),['','','','']);
  assert.equal(texts[texts.indexOf('SUBTOTAL PARCIAL')+1],'');assert.ok(!texts.some(t=>t.includes('R$')));
  texts.length=0;await generateOrderReportPdfs(order());assert.ok(texts.includes('SUBTOTAL'));assert.ok(!texts.includes('SUBTOTAL PARCIAL'));
 }finally{globalThis.document=original;globalThis.createImageBitmap=oldBitmap;}
});
test('real Horti report JPEG PDF parses and renders with readable pending report',{skip:!process.env.CANVAS_MODULE_PATH},async()=>{
 const {createCanvas,loadImage}=await import(process.env.CANVAS_MODULE_PATH),original=globalThis.document,oldBitmap=globalThis.createImageBitmap,dir=await mkdtemp(join(tmpdir(),'horti-report-'));
 globalThis.document={createElement(){const c=createCanvas(1,1);c.toBlob=cb=>cb(new Blob([c.toBuffer('image/jpeg')],{type:'image/jpeg'}));return c;}};globalThis.createImageBitmap=async blob=>loadImage(new Uint8Array(await blob.arrayBuffer()));
 try{
  const o=order();if(process.env.HORTI_BLANK_HEADER_PROOF){o.date='';o.partner={id:'',name:''};}o.items.push({...item(),name:'Batata lavada em caixas',weighMode:'boxes',boxes:[5000000,7500000],unitCount:99},{...item(),name:'Banana prata a conferir',unitCount:null,quantityMicros:null,unitMicros:null,totalCents:null});
  const [result]=await generateOrderReportPdfs(o),path=join(dir,'report.pdf');await writeFile(path,new Uint8Array(await result.blob.arrayBuffer()));
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});assert.match(info,/Pages:\s+1/);assert.match(info,/Page size:\s+595\.276 x 841\.89 pts/);execFileSync('pdftoppm',['-scale-to','1200','-singlefile','-png',path,join(dir,'report')]);
  assert.equal(result.previewPages.length,1);const img=await loadImage(new Uint8Array(await result.previewPages[0].arrayBuffer()));assert.equal(img.height,1200);
  if(process.env.KEEP_HORTI_PROOF){await writeFile('/tmp/horti-report-proof.pdf',new Uint8Array(await result.blob.arrayBuffer()));await writeFile('/tmp/horti-report-preview.jpg',new Uint8Array(await result.previewPages[0].arrayBuffer()));execFileSync('pdftoppm',['-scale-to','1400','-singlefile','-png',path,'/tmp/horti-report-proof']);}
 }finally{globalThis.document=original;globalThis.createImageBitmap=oldBitmap;await rm(dir,{recursive:true,force:true});}
});
