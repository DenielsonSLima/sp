import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuote,setOffer,chooseProvider,updateItemQuantity,removeQuoteProvider,finalizeQuote,finalizeQuoteProvider,isProviderFinalized,isQuoteItemFinalized,selectedTotal} from './fixtures/legacy-operations/quotation-state.js';
import {supplierSummaryRows,supplierSummaryMarkup,matrixTotalsMarkup} from '../interno/cotacao/supplier-summary.js';
import {approvedSupplierReport,generateSupplierQuotePdfs} from '../interno/cotacao/supplier-pdf.js';

function make(){
 const q=createQuote({title:'Reposição da loja',date:'2026-10-20',items:[{name:'Arroz branco',unit:'UN',quantity:2},{name:'Café torrado',unit:'UN',quantity:3}],providers:[{id:'a',name:'Fornecedor A'},{id:'b',name:'Fornecedor B'}]});
 setOffer(q,q.items[0].id,'a','10');setOffer(q,q.items[0].id,'b','9');setOffer(q,q.items[1].id,'a','5');
 chooseProvider(q,q.items[0].id,'a');return q;
}

test('supplier summary separates proposed, partially proposed and manually approved totals',()=>{
 const q=make(),rows=supplierSummaryRows(q);
 assert.equal(rows[0].proposed.total,3500);assert.equal(rows[0].proposed.complete,true);assert.equal(rows[0].total,2000);assert.equal(rows[0].items.length,1);
 assert.equal(rows[1].proposed.subtotal,1800);assert.equal(rows[1].proposed.complete,false);assert.equal(rows[1].proposed.total,null);assert.equal(rows[1].total,0);
 assert.equal(rows.reduce((sum,provider)=>sum+provider.total,0),selectedTotal(q));
 const html=supplierSummaryMarkup(q);assert.equal((html.match(/<li /g)||[]).length,2);assert(html.includes('Total cotado (parcial)'));assert(html.includes('Total geral aprovado'));
 const footer=matrixTotalsMarkup(q);assert(footer.includes('Total cotado'));assert(footer.includes('Total aprovado'));assert(footer.includes('Parcial - há produtos sem preço'));
});

test('individual finalization locks only its approved items and supplier while other suppliers remain editable',()=>{
 const q=make(),[first,second]=q.items;
 const saved=finalizeQuoteProvider(q,'a');assert.equal(saved.total,2000);assert(isProviderFinalized(q,'a'));assert(isQuoteItemFinalized(q,first.id));assert(!isQuoteItemFinalized(q,second.id));assert.equal(q.status,'open');
 assert.throws(()=>setOffer(q,first.id,'b','8'),/finalizado/);assert.throws(()=>setOffer(q,second.id,'a','8'),/finalizado/);
 assert.throws(()=>chooseProvider(q,first.id,'b'),/finalizado/);assert.throws(()=>chooseProvider(q,first.id,null),/finalizado/);assert.throws(()=>chooseProvider(q,second.id,'a'),/finalizado/);
 assert.throws(()=>updateItemQuantity(q,first.id,8),/finalizado/);assert.throws(()=>removeQuoteProvider(q,'a',{clearLinked:true}),/finalizado/);
 assert.throws(()=>finalizeQuoteProvider(q,'b'),/Aprove/);assert(!isProviderFinalized(q,'b'));
 updateItemQuantity(q,second.id,4);setOffer(q,second.id,'b','2');chooseProvider(q,second.id,'b');finalizeQuoteProvider(q,'b');finalizeQuote(q);
 assert.equal(q.status,'finished');assert.equal(q.finalizedProviders.b.total,800);
});

test('finalization snapshots and report values stay isolated from returned objects and later source edits',()=>{
 const q=make(),saved=finalizeQuoteProvider(q,'a');saved.items[0].quantity=999;saved.total=1;
 assert.equal(q.finalizedProviders.a.items[0].quantity,2);assert.equal(finalizeQuoteProvider(q,'a').total,2000);
 q.items[0].name='Nome alterado';q.offers[q.items[0].id].a=1;
 const report=approvedSupplierReport(q,'a');assert.equal(report.items[0].name,'Arroz branco');assert.equal(report.total,2000);assert(report.finalized);
});

test('supplier report includes only approved lines, exact fractional totals and no unpriced or losing products',()=>{
 const q=make();const report=approvedSupplierReport(q,'a');assert.equal(report.items.length,1);assert.equal(report.total,2000);assert.equal(report.items[0].name,'Arroz branco');
 assert.throws(()=>approvedSupplierReport(q,'b'),/não tem produtos aprovados/);assert.throws(()=>approvedSupplierReport(q,'inexistente'),/Fornecedor/);
 updateItemQuantity(q,q.items[1].id,'1,333');setOffer(q,q.items[1].id,'b','2,01');chooseProvider(q,q.items[1].id,'b');
 assert.equal(approvedSupplierReport(q,'b').total,268);assert.equal(approvedSupplierReport(q,'b').items[0].quantity,1.333);
});

test('PDF paginates approved products, repeats the supplier header and retains actual preview pages',async()=>{
 const previousDocument=globalThis.document,previousBitmap=globalThis.createImageBitmap,texts=[];
 const context={fillRect(){},drawImage(){},measureText:text=>({width:text.length*12}),fillText:text=>texts.push(text)};
 globalThis.document={createElement(){return {getContext:()=>context,toBlob:callback=>callback(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}))};}};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const q=createQuote({title:'Compra com muitos produtos',date:'2026-10-20',items:Array.from({length:80},(_,index)=>({name:`Produto ${index} com descrição longa para conferir quebra de linha`,unit:'UN',quantity:2})),providers:[{id:'a',name:'Distribuidora São José'}]});
  for(const item of q.items){setOffer(q,item.id,'a','3,25');chooseProvider(q,item.id,'a');}
  const [result]=await generateSupplierQuotePdfs(q,'a');assert(result.pages>1);assert.equal(result.previewPages.length,result.pages);assert.equal(result.blob.type,'application/pdf');
  assert.equal((await result.blob.text()).match(/\/Type \/Page\b/g).length,result.pages);
  assert.equal(texts.filter(text=>text==='SUPERMERCADO DO POVO').length,result.pages);assert(texts.includes('TOTAL APROVADO'));assert(texts.includes('R$\u00a0520,00'));
 }finally{globalThis.document=previousDocument;globalThis.createImageBitmap=previousBitmap;}
});
