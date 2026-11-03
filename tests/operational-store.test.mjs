import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationalStore} from '../interno/operational-store.js';

function environment(){
 let context={companyId:'store-a',user:{id:'user-a'}},rows=[{id:'order',_version:1,total:100}],listener;
 const calls=[];
 const driver={isRemoteMode:()=>true,getDataContext:()=>context,
  listRecords:async()=>structuredClone(rows),
  subscribeResource(resource,callback){listener=callback;return()=>{listener=null;};},
  async command(resource,action,id,payload,options){calls.push({resource,action,id,payload:structuredClone(payload),...options});if(id&&options.expectedVersion!==rows[0]._version)throw Error('Registro alterado por outra sessão.');const saved={...rows[0],...payload,_version:rows[0]._version+1};rows=[saved];return saved;}
 };
 return {driver,calls,setRows:value=>{rows=value;},setContext:value=>{context=value;},notify:async()=>{listener?.();await new Promise(resolve=>setTimeout(resolve,0));}};
}

test('Realtime refresh retains the viewed version so a stale form cannot overwrite another session',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);
 await store.load();assert.equal(store.get('order')._version,1);
 env.setRows([{id:'order',_version:2,total:200}]);await env.notify();
 await assert.rejects(store.run('setOffer','order',{value:'9,50'}),/outra sessão/);
 assert.equal(env.calls[0].expectedVersion,1);
 assert.equal(store.get('order').total,200);
});

test('switching identity clears snapshots before a new company is loaded',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);
 await store.load();assert.equal(store.list().length,1);
 env.setContext(null);assert.deepEqual(store.list(),[]);
 env.setContext({companyId:'store-b',user:{id:'user-b'}});assert.deepEqual(store.list(),[]);
 env.setRows([{id:'other-order',_version:1,total:55}]);await store.load();
 assert.deepEqual(store.list().map(row=>row.id),['other-order']);
});

test('queued edits snapshot raw input and use only the acknowledged server version',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);
 await store.load();store.get('order');
 const input={value:'4,50'},saving=store.run('setOffer','order',input);input.value='99,00';
 const saved=await saving;assert.equal(saved.value,'4,50');assert.equal(store.get('order')._version,2);
 await store.run('setOffer','order',{value:'6,00'});
 assert.equal(env.calls[1].expectedVersion,2);
});

test('an older list response cannot roll back an acknowledged RPC mutation',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);
 await store.load();store.get('order');
 let resolveRead;env.driver.listRecords=()=>new Promise(resolve=>{resolveRead=resolve;});
 const reading=store.load();await store.run('setOffer','order',{value:'7,50'});
 resolveRead([{id:'order',_version:1,total:100}]);await reading;
 assert.equal(store.get('order')._version,2);assert.equal(store.get('order').value,'7,50');
});

test('domain-owned Realtime can disable the implicit store subscription',async()=>{
 const env=environment();let subscriptions=0;
 env.driver.subscribeResource=()=>{subscriptions++;return()=>{};};
 const store=createOperationalStore('quotes',env.driver,{realtime:false});
 await store.load();await store.load();assert.equal(subscriptions,0);
});

test('reset rejects an old response even when the same identity loads again',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);
 let resolveOld;env.driver.listRecords=()=>new Promise(resolve=>{resolveOld=resolve;});
 const loading=store.load();store.reset();resolveOld([{id:'stale-order',_version:1}]);
 await assert.rejects(loading,/sessão ou empresa ativa mudou/);assert.deepEqual(store.list(),[]);
});

test('detail queries read one record and retain its viewed version for the next RPC',async()=>{
 const env=environment();let listReads=0,detailReads=0;
 env.driver.listRecords=async()=>{listReads++;return[];};
 env.driver.getRecord=async(resource,id)=>{detailReads++;assert.equal(resource,'quotes');assert.equal(id,'order');return{id,_version:1,total:100};};
 const store=createOperationalStore('quotes',env.driver,{realtime:false});
 await store.loadRecord('order');await store.run('setOffer','order',{value:'4,99'});
 assert.equal(listReads,0);assert.equal(detailReads,1);assert.equal(env.calls[0].expectedVersion,1);
});

test('mutation invalidation and a screen refresh share one read after the RPC is acknowledged',async()=>{
 const env=environment(),originalRead=env.driver.listRecords;let reads=0,release;
 env.driver.listRecords=async()=>{reads++;return originalRead();};
 const store=createOperationalStore('quotes',env.driver);await store.load();store.get('order');
 env.driver.command=async()=>{void env.notify();return new Promise(resolve=>{release=resolve;});};
 const saving=store.run('setOffer','order',{value:'4,99'});await new Promise(resolve=>setImmediate(resolve));
 const first=store.load(),second=store.load();assert.equal(reads,1);
 const saved={id:'order',_version:2,total:100,value:'4,99'};env.setRows([saved]);release(saved);
 await Promise.all([saving,first,second]);assert.equal(reads,2);assert.equal(store.get('order')._version,2);
});

test('a fresh session does not wait for a previous session mutation to finish',async()=>{
 const env=environment(),store=createOperationalStore('quotes',env.driver);await store.load();
 let releaseOld;
 env.driver.command=async(resource,action,id)=>action==='old'?new Promise(resolve=>{releaseOld=resolve;}):{id,_version:2,total:200};
 const old=store.run('old','order');await new Promise(resolve=>setImmediate(resolve));
 store.reset();const next=await store.run('new','order');assert.equal(next.total,200);
 releaseOld({id:'order',_version:9,total:900});await assert.rejects(old,/empresa ativa mudou/);assert.equal(store.get('order').total,200);
});
