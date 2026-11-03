import test from 'node:test';
import assert from 'node:assert/strict';
import { awardedGroupsMarkup, attachDiscountForm } from '../interno/cotacao/award-groups.js';
import { approvedSupplierReport } from '../interno/cotacao/supplier-pdf.js';

class Input extends EventTarget {
  constructor(value='0,00') { super(); this.value=value;this.selectionStart=this.selectionEnd=value.length;this.validationMessage=''; }
  removeAttribute(){}setAttribute(){}setCustomValidity(value){this.validationMessage=value;}
  checkValidity(){return !this.validationMessage;}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
  dispatchEvent(event){const result=super.dispatchEvent(event);this[`on${event.type}`]?.(event);return result;}
  replace(data){this.setSelectionRange(0,this.value.length);const event=new Event('beforeinput',{cancelable:true});Object.defineProperties(event,{inputType:{value:'insertText'},data:{value:data}});this.dispatchEvent(event);}
}
test('discount amount and percentage changes autosave in order without replacing a newer input',async()=>{
 const input=new Input(),type={value:'amount'},form={elements:{discount:input,type}},drafts=[],saved=[],calls=[];let release;
 attachDiscountForm(form,{saved:{type:'amount',value:'0,00'},onDraft:v=>drafts.push(v),save:(type,value)=>{calls.push({type,value});return new Promise(resolve=>release=resolve);},onSaving(){},onSaved:v=>saved.push(v),onError:error=>{throw error;}});
 input.replace('250');assert.equal(input.value,'2,50');const pending=input.onblur();type.value='percent';type.onchange();assert.deepEqual(calls,[{type:'amount',value:'2.50'}]);release();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[{type:'amount',value:'2.50'},{type:'percent',value:'2.50'}]);release();await pending;assert.equal(input.value,'2,50');assert.equal(saved.length,2);assert.equal(drafts.at(-1).type,'percent');
});
test('discount failures keep raw input and retry on leaving the field',async()=>{
 const input=new Input(),type={value:'amount'},form={elements:{discount:input,type}},errors=[];let attempts=0;
 attachDiscountForm(form,{saved:{type:'amount',value:'0,00'},onDraft(){},onSaving(){},onSaved(){},onError:error=>errors.push(error.message),save:async()=>{if(++attempts===1)throw Error('Sem conexão');}});
 input.replace('999');await input.onblur();assert.equal(input.value,'9,99');assert.deepEqual(errors,['Sem conexão']);await input.onblur();assert.equal(attempts,2);
});
const quote=()=>({id:'quote',title:'Compra',date:'2026-11-01',status:'open',items:[{id:'item'}],providers:[{id:'supplier',name:'Fornecedor'}],awards:{item:'supplier'},offers:{item:{supplier:1000}},computed:{selectedTotal:500,awardedByProvider:[{id:'supplier',name:'Fornecedor',grossTotal:1000,itemDiscountTotal:200,subtotal:800,discountTotal:300,total:500,items:[{id:'item',productId:'p',name:'Café <especial>',category:'Mercearia',unit:'UN',quantity:1,unitPrice:1000,grossTotal:1000,discount:{type:'percent',value:2000},discountTotal:200,total:800}]}]}});
test('final comparison keeps product photos and individual/general controls with canonical net totals',()=>{
 const q=quote(),markup=awardedGroupsMarkup(q,{itemPhoto:()=>'<img alt="Produto" src="test.png">',drafts:new Map()});
 assert.match(markup,/<img alt="Produto"/);assert.match(markup,/Café &lt;especial&gt;/);assert.match(markup,/Desconto no produto/);assert.match(markup,/Desconto geral do fornecedor/);assert.match(markup,/data-item="item"/);assert.match(markup,/data-item=""/);assert.match(markup,/20,00/);assert.match(markup,/data-group-net>R\$\s*5,00/);
 q.status='finished';assert.match(awardedGroupsMarkup(q,{itemPhoto:()=>'',drafts:new Map()}),/name="discount"[^>]*disabled/);
});
test('each supplier header offers finalization and PDF export, preserving pending and finalized guards',()=>{
 const q=quote(),render=pending=>awardedGroupsMarkup(q,{itemPhoto:()=>'',drafts:new Map(),pending});
 const header=render(false).match(/<header>(.*?)<\/header>/s)[1];
 assert.match(header,/Fornecedor/);assert.match(header,/data-supplier-pdf="supplier"[^>]*>Exportar/);assert.match(header,/data-finalize-provider="supplier"[^>]*>Finalizar/);
 assert.match(render(true),/data-supplier-pdf="supplier"[^>]*disabled/);assert.match(render(true),/data-finalize-provider="supplier"[^>]*disabled/);
 q.finalizedProviders={supplier:q.computed.awardedByProvider[0]};
 const finalized=render(true).match(/<header>(.*?)<\/header>/s)[1];assert.match(finalized,/data-finalize-provider="supplier"[^>]*disabled[^>]*>Finalizado/);assert.doesNotMatch(finalized,/data-supplier-pdf="supplier"[^>]*disabled/);
});
test('supplier PDF preserves server discounts and allows a fully discounted line',()=>{
 const q=quote();q.computed.awardedByProvider[0].items[0].total=0;q.computed.awardedByProvider[0].total=0;
 const report=approvedSupplierReport(q,'supplier');assert.equal(report.items[0].total,0);assert.equal(report.items[0].discountTotal,200);assert.equal(report.grossTotal,1000);assert.equal(report.itemDiscountTotal,200);assert.equal(report.discountTotal,300);assert.equal(report.total,0);
});
