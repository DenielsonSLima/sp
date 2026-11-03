import test from 'node:test';import assert from 'node:assert/strict';
import {openQuoteProviderDialog} from '../interno/cotacao/provider-dialog.js';import {partners} from '../interno/cadastros/parceiros/state.js';
function fixture(t,rows=[]){
 const previous={document:globalThis.document,window:globalThis.window};partners.splice(0,partners.length,...rows);
 const search={value:'',focus(){}},name={value:'Fornecedor novo',focus(){}},email={value:'contato@example.com'},phone={value:'79999999999'},submit={},error={textContent:''},close={},cancel={},newButton={},existingButton={},picker={innerHTML:''},existing={},create={},all={},count={},allLabel={};
 let markup,checkboxes=[];const checks=()=>{if(markup!==picker.innerHTML){markup=picker.innerHTML;checkboxes=[...markup.matchAll(/<input type="checkbox" name="provider" value="([^"]+)" ([^>]*)>/g)].map(m=>({value:m[1],checked:m[2].includes('checked')}));}return checkboxes;};
 const form={setAttribute(){},elements:{search,name,email,phone},querySelector:()=>submit,querySelectorAll:()=>[search,name,email,phone,submit,close,cancel,newButton,existingButton,all,...checks()]};let dialog;
 class FakeDialog extends EventTarget{open=false;attributes={};setAttribute(key,value){this.attributes[key]=value;}querySelector(selector){return ({form,'.quote-error':error,'[data-close]':close,'[data-cancel]':cancel,'[data-new]':newButton,'[data-existing]':existingButton,'.quote-provider-picker':picker,'.quote-provider-existing':existing,'.quote-provider-create':create,'[data-select-all]':all,'[data-selection-count]':count,'[data-select-all-label]':allLabel})[selector];}querySelectorAll(selector){return selector==='[name=provider]'?checks():[];}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}remove(){this.removed=true;}}
 const host={isConnected:true,querySelector:()=>dialog&&!dialog.removed?dialog:null,append:node=>{dialog=node;}};
 globalThis.document={body:{style:{overflow:'auto'}},createElement:()=>new FakeDialog()};globalThis.window=new EventTarget();
 t.after(()=>{if(dialog&&!dialog.removed)cancel.onclick();partners.splice(0);globalThis.document=previous.document;globalThis.window=previous.window;});
 return {host,form,search,name,email,phone,all,count,submit,select(id,checked=true){const input=checks().find(row=>row.value===id);assert(input);input.checked=checked;input.onchange();},error,newButton,existingButton,picker,create,existing,cancel,get dialog(){return dialog;}};
}
test('existing supplier selection excludes linked partners and never creates a duplicate registration',async t=>{
 const env=fixture(t,[{id:'supplier',name:'Fornecedor',type:'Fornecedor'},{id:'linked',name:'Já vinculado',type:'Ambos'}]);let linked;
 openQuoteProviderDialog({host:env.host,items:[{id:'linked'}],createPartner:()=>{throw Error('Unexpected creation');},onSubmit:provider=>{linked=provider.id;}});
 assert(env.dialog.open);assert.match(env.picker.innerHTML,/Fornecedor/);assert.doesNotMatch(env.picker.innerHTML,/Já vinculado/);assert(env.name.disabled);
 env.select('supplier');await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.equal(linked,'supplier');assert(env.dialog.removed);assert.equal(document.body.style.overflow,'auto');
});
test('new supplier is registered as Fornecedor, linked to the quote, then closes',async t=>{
 const env=fixture(t);let registration,linked;
 openQuoteProviderDialog({host:env.host,items:[],createPartner:async input=>{registration=input;return{id:'new',...input};},onSubmit:provider=>{linked=provider.id;}});
 env.newButton.onclick();assert.equal(env.create.hidden,false);assert.equal(env.name.disabled,false);
 await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.deepEqual(registration,{name:'Fornecedor novo',type:'Fornecedor',email:'contato@example.com',phone:'79999999999'});assert.equal(linked,'new');assert(env.dialog.removed);
});
test('failed quote linkage keeps a newly registered supplier for retry without registering again',async t=>{
 const env=fixture(t);let created=0,attempts=0;
 openQuoteProviderDialog({host:env.host,items:[],createPartner:async()=>{created++;return{id:'new',name:'Fornecedor novo'};},onSubmit:async()=>{if(++attempts===1)throw Error('Cotação alterada.');}});
 env.newButton.onclick();await env.form.onsubmit(new Event('submit',{cancelable:true}));assert(env.dialog.open);assert.equal(created,1);assert.match(env.error.textContent,/Fornecedor cadastrado/);assert(env.name.disabled);
 await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.equal(created,1);assert.equal(attempts,2);assert(env.dialog.removed);
});

test('multiple suppliers remain selected across searches and partial retry never repeats successful links',async t=>{
 const env=fixture(t,[{id:'a',name:'Arroz',type:'Fornecedor'},{id:'b',name:'Bebidas',type:'Ambos'},{id:'client',name:'Cliente',type:'Cliente'}]);const calls=[];let fail=true;
 openQuoteProviderDialog({host:env.host,items:[],onSubmit:async row=>{calls.push(row.id);if(row.id==='b'&&fail)throw Error('Falha');}});
 env.select('a');env.search.value='Bebidas';env.search.oninput();env.all.checked=true;env.all.onchange();assert.match(env.count.textContent,/2 fornecedor/);
 await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.deepEqual(calls,['a','b']);assert.match(env.error.textContent,/1 fornecedor.*já adicionado/);assert(env.dialog.open);
 fail=false;await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.deepEqual(calls,['a','b','b']);assert(env.dialog.removed);
});
