import test from 'node:test';import assert from 'node:assert/strict';import {openPartnerDialog} from '../interno/cadastros/parceiros/dialog.js';
function fixture(t){
 const previous={document:globalThis.document,window:globalThis.window};const fields=['cnpj','name','legalName','tradeName','type','email','phone','street','number','complement','district','city','state','postalCode'];
 const elements=Object.fromEntries(fields.map(key=>{const node=new EventTarget();node.value=key==='type'?'Fornecedor':'';node.focus=()=>{};return[key,node];}));
 const lookup={},submit={},cancel={},close={},error={textContent:''},status={textContent:''};const form={elements,querySelector:()=>submit,querySelectorAll:()=>[...Object.values(elements),lookup,submit,cancel,close]};let dialog;
 class FakeDialog extends EventTarget{open=false;setAttribute(){}querySelector(selector){return ({form,'[data-lookup]':lookup,'[data-cancel]':cancel,'[data-close]':close,'.partner-save-error':error,'.partner-lookup-status':status})[selector];}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}remove(){this.removed=true;}}
 const host={isConnected:true,querySelector:()=>dialog&&!dialog.removed?dialog:null,append:node=>{dialog=node;}};
 globalThis.document={body:{style:{overflow:'auto'}},createElement:()=>new FakeDialog()};globalThis.window=new EventTarget();
 t.after(()=>{if(dialog&&!dialog.removed)cancel.onclick();globalThis.document=previous.document;globalThis.window=previous.window;});return {host,elements,form,lookup,submit,cancel,error,status,get dialog(){return dialog;}};
}
test('partner modal fills company fields from lookup, preserves concurrent typing and saves address with the record version',async t=>{
 const env=fixture(t);let resolve,saved;openPartnerDialog({host:env.host,partner:{id:'partner',_version:4},lookup:()=>new Promise(done=>{resolve=done;}),save:async input=>{saved=input;return input;}});
 assert(env.dialog.open);assert.equal(env.dialog.className,'partner-dialog');env.elements.cnpj.value='00.000.000/0001-91';const pending=env.lookup.onclick();env.elements.name.value='Nome revisado durante consulta';resolve({provider:'BrasilAPI',record:{cnpj:'00000000000191',name:'EMPRESA',legalName:'EMPRESA SA',street:'RUA CENTRAL',number:'12',district:'CENTRO',city:'ARACAJU',state:'SE',postalCode:'49000001'}});await pending;
 assert.equal(env.elements.name.value,'Nome revisado durante consulta');assert.equal(env.elements.legalName.value,'EMPRESA SA');assert.equal(env.elements.state.value,'SE');assert.match(env.status.textContent,/Revise/);
 await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.equal(saved._version,4);assert.equal(saved.id,'partner');assert.equal(saved.street,'RUA CENTRAL');assert.equal(saved.number,'12');assert(env.dialog.removed);assert.equal(document.body.style.overflow,'auto');
});
test('changing CNPJ prevents an old lookup response from overwriting the current form',async t=>{
 const env=fixture(t);let resolve;openPartnerDialog({host:env.host,lookup:()=>new Promise(done=>{resolve=done;})});env.elements.cnpj.value='00000000000191';const pending=env.lookup.onclick();env.elements.cnpj.value='00000000E08G12';env.elements.cnpj.oninput();resolve({provider:'BrasilAPI',record:{cnpj:'00000000000191',name:'Old company'}});await pending;assert.equal(env.elements.name.value,'');assert.equal(env.elements.cnpj.value,'00000000E08G12');assert.equal(env.submit.disabled,false);
});
test('lookup or persistence errors preserve the modal and cancellation never saves',async t=>{
 const env=fixture(t);let saves=0;openPartnerDialog({host:env.host,lookup:async()=>{throw Error('Serviço indisponível.');},save:async()=>{saves++;throw Error('CNPJ já cadastrado.');}});env.elements.name.value='Cadastro manual';await env.lookup.onclick();assert.match(env.status.textContent,/indisponível/);assert.equal(env.elements.name.value,'Cadastro manual');await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.match(env.error.textContent,/CNPJ já cadastrado/);assert(env.dialog.open);env.cancel.onclick();assert(env.dialog.removed);assert.equal(saves,1);
});
