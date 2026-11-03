import test from 'node:test';import assert from 'node:assert/strict';
import {openQuoteCreateDialog} from '../interno/cotacao/create-dialog.js';
function fixture(t){
 const previous={document:globalThis.document,window:globalThis.window};
 const title={value:'Reposição',focus(){this.focused=true;}},date={value:'2026-10-31'},notes={value:'Entregar pela manhã'},submit={},cancel={},close={},error={textContent:''};
 const form=new EventTarget();form.elements={title,date,notes};form.querySelector=()=>submit;form.querySelectorAll=()=>[title,date,notes,submit,cancel,close];
 let dialog;const host={isConnected:true,querySelector:()=>dialog&&!dialog.removed?dialog:null,append:node=>{dialog=node;}};
 class FakeDialog extends EventTarget{open=false;attributes={};setAttribute(name,value){this.attributes[name]=value;}querySelector(selector){return ({form,'[data-close]':close,'[data-cancel]':cancel,'.quote-error':error})[selector];}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}remove(){this.removed=true;}}
 globalThis.document={body:{style:{overflow:'auto'}},createElement:()=>new FakeDialog()};globalThis.window=new EventTarget();
 t.after(()=>{if(dialog&&!dialog.removed)cancel.onclick();globalThis.document=previous.document;globalThis.window=previous.window;});
 return {host,title,date,notes,submit,cancel,close,error,form,get dialog(){return dialog;}};
}
test('fullscreen creation shows three fields, saves only the header and opens the saved quote',async t=>{
 const env=fixture(t);let received,opened;openQuoteCreateDialog({host:env.host,save:async payload=>{received=payload;return{id:'saved'};},onSaved:quote=>{opened=quote.id;}});
 assert.equal(env.dialog.className,'quote-create-dialog');assert(env.dialog.open);assert(env.title.focused);assert.equal(document.body.style.overflow,'hidden');
 assert.match(env.dialog.innerHTML,/Descrição/);assert.match(env.dialog.innerHTML,/Observação/);assert.doesNotMatch(env.dialog.innerHTML,/Fornecedores|quote-steps|Continuar/);
 await env.form.onsubmit(new Event('submit',{cancelable:true}));assert.deepEqual(received,{title:'Reposição',date:'2026-10-31',notes:'Entregar pela manhã'});assert.equal(opened,'saved');assert(env.dialog.removed);assert.equal(document.body.style.overflow,'auto');
});
test('a pending save blocks duplicate submits and cancellation; an error retains all fields',async t=>{
 const env=fixture(t);let reject,calls=0;const pending=new Promise((resolve,fail)=>{reject=fail;});
 openQuoteCreateDialog({host:env.host,save:()=>{calls++;return pending;}});const request=env.form.onsubmit(new Event('submit',{cancelable:true}));
 await env.form.onsubmit(new Event('submit',{cancelable:true}));env.cancel.onclick();assert.equal(calls,1);assert(env.dialog.open);assert(env.submit.disabled);
 reject(Error('Descrição inválida.'));await request;assert(env.dialog.open);assert.equal(env.notes.value,'Entregar pela manhã');assert.equal(env.error.textContent,'Descrição inválida.');assert.equal(env.submit.disabled,false);
});
test('cancel and Escape close without creating a quote',t=>{
 const env=fixture(t);let saves=0,cancels=0;openQuoteCreateDialog({host:env.host,save:()=>saves++,onCancel:()=>cancels++});const event=new Event('cancel',{cancelable:true});env.dialog.dispatchEvent(event);
 assert(event.defaultPrevented);assert.equal(saves,0);assert.equal(cancels,1);assert(env.dialog.removed);assert.equal(document.body.style.overflow,'auto');
});
test('navigation releases the modal and ignores late save navigation',async t=>{
 const env=fixture(t);let resolve,opens=0;openQuoteCreateDialog({host:env.host,save:()=>new Promise(done=>{resolve=done;}),onSaved:()=>opens++});const pending=env.form.onsubmit(new Event('submit',{cancelable:true}));window.dispatchEvent(new Event('hashchange'));assert(env.dialog.removed);assert.equal(document.body.style.overflow,'auto');resolve({id:'late'});await pending;assert.equal(opens,0);
 // Explicit cancellation of the preserved draft avoids leaking state to a later screen.
 openQuoteCreateDialog({host:env.host});env.cancel.onclick();
});
