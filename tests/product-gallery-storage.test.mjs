import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductStorage} from '../interno/cadastros/produtos/storage.js';
// Deterministic transaction queue: readwrite locks are held through complete/abort.
function fakeIDB(){const data=new Map();let queue=Promise.resolve();const db={transaction(){let unlock,aborted=false,scheduled=false;const previous=queue;queue=new Promise(resolve=>unlock=resolve);const pending=new Map();const tx={abort(){aborted=true;queueMicrotask(()=>{tx.onabort?.();unlock();});},objectStore(){return {get(key){const request={};previous.then(()=>{request.result=structuredClone(data.get(key));request.onsuccess?.();if(!scheduled){scheduled=true;setImmediate(()=>{if(!aborted){for(const [key,value] of pending)data.set(key,structuredClone(value));tx.oncomplete?.();unlock();}});}});return request;},put(next,key){pending.set(key,structuredClone(next));}};}};return tx;}};return {open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.();});return request;}};}
test('two tabs cannot silently overwrite another catalog transaction',async()=>{const idb=fakeIDB(),tabA=createProductStorage(idb),tabB=createProductStorage(idb);assert.deepEqual(await tabA.load(),[]);assert.deepEqual(await tabB.load(),[]);await tabA.save([{id:'a',name:'Tomate'}]);await assert.rejects(tabB.save([{id:'b',name:'Cebola'}]),/outra aba/);assert.deepEqual(await tabB.load(),[{id:'a',name:'Tomate'}]);await tabB.save([{id:'a',name:'Tomate'},{id:'b',name:'Cebola'}]);assert.deepEqual(await tabA.load(),[{id:'a',name:'Tomate'},{id:'b',name:'Cebola'}]);});
test('unavailable storage rejects honestly',async()=>{await assert.rejects(createProductStorage(null).load(),/não está disponível/);});

test('catalog, backup and migration marker commit together and survive a new repository connection',async()=>{
 const idb=fakeIDB(),store=createProductStorage(idb),before=[{id:'old'}],after=[{id:'new'}];
 await store.load();await store.save(before);
 await store.load({migrationId:'catalog-v1'});assert.equal(await store.hasMigration('catalog-v1'),false);
 await store.save(after,{migration:{id:'catalog-v1',backup:before}});
 const reloaded=createProductStorage(idb);assert.deepEqual(await reloaded.load({migrationId:'catalog-v1'}),after);
 assert.equal(await reloaded.hasMigration('catalog-v1'),true);assert.deepEqual(await reloaded.readMigrationBackup('catalog-v1'),before);
 const stale=createProductStorage(idb);await stale.load();await reloaded.save([{id:'later'}]);
 await assert.rejects(stale.save([{id:'lost'}],{migration:{id:'other',backup:[]}}),/outra aba/);
 assert.equal(await reloaded.hasMigration('other'),false);assert.deepEqual(await reloaded.readMigrationBackup('catalog-v1'),before);
});
