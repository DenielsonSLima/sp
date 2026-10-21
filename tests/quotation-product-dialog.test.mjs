import test from 'node:test';
import assert from 'node:assert/strict';
import {openQuoteProductDialog} from '../interno/cotacao/product-dialog.js';
import {providerPresentation,quoteProductPhoto} from '../interno/cotacao/presentation.js';
import {createQuote,addQuoteItem} from '../interno/cotacao/state.js';

const products=[{id:'p1',name:'Arroz',category:'Mercearia',unit:'UN'}, {id:'p2',name:'Café <especial>',code:'CF-2',category:'Mercearia',unit:'UN',photo:'data:image/png;base64,aGVsbG8='}];
function setup(t,draft={open:false,product:'',quantity:'1'}){
 const priorDocument=globalThis.document,priorWindow=globalThis.window;
 const search={value:draft.query||'',focus(){this.focused=true;}},quantity={value:draft.quantity};
 const picker={innerHTML:''},error={textContent:''},close={},cancel={},trigger={isConnected:true,focus(){this.focused=true;}};
 const form=new EventTarget();form.elements={quantity};
 let dialog,selected=draft.product,created=0;
 const host={querySelector(){return dialog&&!dialog.removed?dialog:null;},append(node){dialog=node;}};
 class FakeDialog extends EventTarget{
  open=false;removed=false;attributes={};
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(selector){return ({form,'[data-search]':search,'.quote-product-picker':picker,'.quote-error':error,'[data-close]':close,'[data-cancel]':cancel})[selector]||(selector==='[name=product]:checked'&&selected?{value:selected}:null);}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent(new Event('close'));}
  remove(){this.removed=true;}
  getBoundingClientRect(){return {left:20,right:500,top:20,bottom:500};}
 }
 globalThis.document={body:{style:{overflow:'auto'}},createElement(){created++;return new FakeDialog();}};
 globalThis.window=new EventTarget();
 t.after(()=>{globalThis.document=priorDocument;globalThis.window=priorWindow;});
 return {host,draft,trigger,search,quantity,picker,error,close,cancel,form,get dialog(){return dialog;},get created(){return created;},select(value){selected=value;}};
}

test('picker opens a native modal, excludes existing products and searches without losing the selection',t=>{
 const env=setup(t);openQuoteProductDialog({...env,products,items:[{productId:'p1'}],onSubmit(){}});
 assert(env.dialog.open);assert(env.search.focused);assert.equal(document.body.style.overflow,'hidden');
 assert.equal(env.dialog.attributes['aria-labelledby'],'quote-product-dialog-title');
 assert(!env.picker.innerHTML.includes('value="p1"'));assert(env.picker.innerHTML.includes('value="p2"'));
 assert(env.picker.innerHTML.includes('Café &lt;especial&gt;'));assert(env.picker.innerHTML.includes('<img'));
 env.search.value='inexistente';env.search.oninput();assert.match(env.picker.innerHTML,/Nenhum produto encontrado/);
 env.select('p2');env.search.oninput();assert(env.picker.innerHTML.includes('value="p2"'));
 openQuoteProductDialog({...env,products,items:[],onSubmit(){}});assert.equal(env.created,1);
 env.cancel.onclick();assert.equal(document.body.style.overflow,'auto');assert(env.trigger.focused);assert.equal(env.draft.open,false);
});

test('invalid quantities keep the modal, photo selection and raw quantity; a valid submit adds exactly once',t=>{
 const env=setup(t),q=createQuote({title:'Compra',date:'2026-10-20',items:[{productId:'p1',name:'Arroz',quantity:2,unit:'UN'}],providers:[{id:'f1',name:'Fornecedor'}]});
 const reasons=[];
 openQuoteProductDialog({...env,products,items:q.items,onSubmit:(product,quantity)=>addQuoteItem(q,product,quantity),onClose:reason=>reasons.push(reason)});
 env.select('p2');env.quantity.value='inválido';env.form.onsubmit(new Event('submit',{cancelable:true}));
 assert(env.dialog.open);assert.equal(q.items.length,1);assert.equal(env.draft.quantity,'inválido');assert(env.error.textContent);
 env.quantity.value='3,5';env.form.onsubmit(new Event('submit',{cancelable:true}));
 assert.equal(q.items.length,2);assert.equal(q.items[1].quantity,3.5);assert(env.dialog.removed);assert.deepEqual(reasons,['saved']);
 assert.equal(env.draft.product,'');assert.equal(env.draft.quantity,'1');assert.equal(document.body.style.overflow,'auto');
});

test('Escape cancels without submitting and navigation preserves raw product drafts while releasing the modal',t=>{
 const env=setup(t),reasons=[];let submissions=0;
 const options={...env,products,items:[],onSubmit(){submissions++;},onClose:reason=>reasons.push(reason)};
 openQuoteProductDialog(options);const escape=new Event('cancel',{cancelable:true});env.dialog.dispatchEvent(escape);
 assert(escape.defaultPrevented);assert.equal(submissions,0);assert.equal(env.draft.open,false);
 openQuoteProductDialog(options);env.select('p2');env.quantity.value='2,';window.dispatchEvent(new Event('hashchange'));
 assert.equal(env.draft.product,'p2');assert.equal(env.draft.quantity,'2,');assert(env.draft.open);assert(env.dialog.removed);
 assert.deepEqual(reasons,['cancel','navigation']);assert.equal(document.body.style.overflow,'auto');
});

test('supplier headings shrink with supplier count and preserve complete identifiable names',()=>{
 let lastWidth=Infinity,lastLength=Infinity;
 for(const count of [1,2,4,6,9,15]){
  const suppliers=Array.from({length:count},(_,i)=>({id:`f${i}`,name:`Distribuidora de alimentos muito comprida ${i}`}));
  const original=structuredClone(suppliers),view=providerPresentation(suppliers);
  assert(view.columnWidth<=lastWidth);assert(view.providers[0].label.length<=lastLength);
  assert.equal(new Set(view.providers.map(p=>p.code)).size,count);
  for(const [i,provider] of view.providers.entries()){assert.equal(provider.name,suppliers[i].name);assert.match(provider.color,/^#[0-9a-f]{6}$/);}
  assert.deepEqual(suppliers,original);lastWidth=view.columnWidth;lastLength=view.providers[0].label.length;
 }
 assert.equal(providerPresentation([{id:'f',name:'Fornecedor A'}]).providers[0].label,'Fornecedor A');
});

test('product thumbnails use the main catalog photo, escape names and reject remote or invalid image sources',()=>{
 const markup=quoteProductPhoto({...products[1],photos:['data:image/webp;base64,YQ==']});
 assert(markup.includes('data:image/webp;base64,YQ=='));assert(markup.includes('Café &lt;especial&gt;'));
 assert(!quoteProductPhoto({name:'Sem foto',photo:'javascript:alert(1)'}).includes('<img'));
 assert(!quoteProductPhoto({name:'Sem foto',photo:'https://example.com/photo.jpg'}).includes('<img'));
 assert.match(quoteProductPhoto(null,'Produto removido'),/Sem foto de Produto removido/);
});
