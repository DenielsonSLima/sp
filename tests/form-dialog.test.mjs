import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFormDialog} from '../shared/form-dialog.js';
function fixture(t){
 const old={document:globalThis.document,window:globalThis.window,MutationObserver:globalThis.MutationObserver};let focused=0;
 class Node extends EventTarget{constructor(tag='div'){super();this.tag=tag;this.children=[];this.isConnected=true;this.style={overflow:'auto'};this.classList={add(){}};this.textContent='';}append(...children){this.children.push(...children);}setAttribute(key,value){this[key]=value;}focus(){focused++;}querySelector(selector){if(selector==='h2,h3')return this.heading;if(selector==='[type=submit]:disabled')return this.busy?{}:null;if(selector==='[data-cancel]')return this.cancel;return this.input;}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}remove(){this.isConnected=false;}}
 const observers=[];globalThis.MutationObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.stopped=true;}};
 const trigger=new Node('button'),body=new Node('body'),host=new Node(),form=new Node('form');form.heading=new Node('h2');form.heading.textContent='Novo modelo';form.input=new Node('input');
 globalThis.document={body,activeElement:trigger,createElement:tag=>new Node(tag)};globalThis.window=new EventTarget();let modal;
 t.after(()=>{modal?.dispose();Object.assign(globalThis,old);});return {form,host,body,observers,set modal(value){modal=value;},get focused(){return focused;}};
}
test('shared form modal keeps form identity, focuses input, blocks Escape while saving and restores page after cancel',t=>{
 const env=fixture(t);let cancels=0;const modal=bindFormDialog(env.form,{host:env.host,cancelSelector:'[data-cancel]'});env.modal=modal;env.form.cancel={click(){cancels++;modal.close();}};
 modal.open();assert(modal.dialog.open);assert.equal(env.form.hidden,false);assert(modal.dialog.children.includes(env.form));assert.equal(env.body.style.overflow,'hidden');assert.equal(env.focused,1);
 env.form.busy=true;modal.dialog.dispatchEvent(new Event('cancel',{cancelable:true}));assert(modal.dialog.open);assert.equal(cancels,0);
 env.form.busy=false;modal.dialog.dispatchEvent(new Event('cancel',{cancelable:true}));assert.equal(cancels,1);assert.equal(env.form.hidden,true);assert.equal(env.body.style.overflow,'auto');assert.equal(env.focused,2);
});
test('navigation disposes a modal, unlocks scrolling and drops late reopen attempts without submitting',t=>{
 const env=fixture(t);const modal=bindFormDialog(env.form,{host:env.host});env.modal=modal;modal.open();window.dispatchEvent(new Event('hashchange'));assert.equal(modal.dialog.isConnected,false);assert.equal(env.body.style.overflow,'auto');assert(env.observers.every(observer=>observer.stopped));modal.open();assert.equal(modal.dialog.open,false);
});
