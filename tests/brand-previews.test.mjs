import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAssetPreviews} from '../interno/cadastros/biblioteca-marca/previews.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('metadata-only redraw observes only unloaded images and preserves displayed previews',t=>{
 const original=globalThis.IntersectionObserver,observed=[];
 globalThis.IntersectionObserver=class{observe(image){observed.push(image);}unobserve(){}disconnect(){}};
 t.after(()=>globalThis.IntersectionObserver=original);
 const loaded={dataset:{brandPreview:'kept'},isConnected:true,src:'pixels-kept',getAttribute:()=> 'pixels-kept'};
 const unloaded={dataset:{brandPreview:'new'},isConnected:true,getAttribute:()=>null};
 const stop=mountAssetPreviews({isConnected:true,querySelectorAll:()=>[loaded,unloaded]},[],{read:()=>assert.fail('Preview was refetched')});
 t.after(stop);
 assert.deepEqual(observed,[unloaded]);assert.equal(loaded.src,'pixels-kept');
});
test('brand PNGs are fetched only when visible, with four requests at a time, and obsolete folders cannot paint',async t=>{
 const original=globalThis.IntersectionObserver;let observer;
 globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;observer=this;}observe(){}unobserve(){}disconnect(){this.disconnected=true;}};
 t.after(()=>globalThis.IntersectionObserver=original);
 const assets=Array.from({length:5},(_,index)=>({id:'asset-'+index,_version:index+1}));
 const images=assets.map(asset=>({dataset:{brandPreview:asset.id},isConnected:true}));
 const root={isConnected:true,querySelectorAll:()=>images},jobs=[];let active=0,maximum=0;
 const stop=mountAssetPreviews(root,assets,{read:async(id,version)=>{active++;maximum=Math.max(maximum,active);let release;const pending=new Promise(resolve=>release=resolve);jobs.push({id,version,release});await pending;active--;return {dataURL:'pixels-'+id};}});
 assert.equal(jobs.length,0);observer.callback(images.map(target=>({target,isIntersecting:true})));assert.equal(jobs.length,4);
 jobs[0].release();await settle();assert.equal(jobs.length,5);assert.equal(images[0].src,'pixels-asset-0');assert.equal(jobs[0].version,1);
 stop();jobs.slice(1).forEach(job=>job.release());await settle();assert.equal(maximum,4);assert.equal(jobs.length,5);assert.equal(images[1].src,undefined);assert.equal(observer.disconnected,true);
});

test('leaving a panel automatically disconnects both observers and suppresses pending results and errors',async t=>{
 const prior={IntersectionObserver:globalThis.IntersectionObserver,MutationObserver:globalThis.MutationObserver,document:globalThis.document};let visibility,lifecycle;
 globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;visibility=this;}observe(){}unobserve(){}disconnect(){this.disconnected=true;}};
 globalThis.MutationObserver=class{constructor(callback){this.callback=callback;lifecycle=this;}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.document={body:{}};t.after(()=>Object.assign(globalThis,prior));
 const images=[0,1,2,3,4].map(index=>({dataset:{brandPreview:'asset-'+index},isConnected:true})),assets=images.map(image=>({id:image.dataset.brandPreview,_version:1}));
 const root={isConnected:true,querySelectorAll:()=>images},jobs=[];let active=true,errors=0;
 const stop=mountAssetPreviews(root,assets,{isCurrent:()=>active,onError:()=>errors++,read:()=>new Promise((resolve,reject)=>jobs.push({resolve,reject}))});
 t.after(stop);visibility.callback(images.map(target=>({target,isIntersecting:true})));assert.equal(jobs.length,4);
 active=false;lifecycle.callback();assert.equal(visibility.disconnected,true);assert.equal(lifecycle.disconnected,true);
 jobs[0].resolve({dataURL:'old-pixels'});jobs.slice(1).forEach(job=>job.reject(Error('Old request failed')));await settle();
 assert.equal(jobs.length,4);assert.equal(images[0].src,undefined);assert.equal(errors,0);
});
