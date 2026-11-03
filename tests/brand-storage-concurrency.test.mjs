import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrandAssetStorage} from '../interno/cadastros/biblioteca-marca/storage.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const metadata={id:'logo',name:'Logo',category:'Logos',width:100,height:40,_version:1};
const pixels='data:image/png;base64,AAAA';
function fixture(overrides={}){
 let context={companyId:'a',user:{id:'user'}},changed;
 const writes=[],deletes=[],metadataWrites=[];
 const store=createBrandAssetStorage({context:()=>context,onContextChange:(_resource,callback)=>{changed=callback;return()=>{};},read:async()=>[{...metadata}],readOne:async()=>({...metadata,dataURL:pixels}),write:async(...args)=>{writes.push(args);return args[1];},remove:async(...args)=>{deletes.push(args);return true;},updateMetadata:async(id,value)=>{metadataWrites.push([id,value]);return {...metadata,...value,_version:2};},...overrides});
 return {store,writes,deletes,metadataWrites,switchContext(next){context=next;changed();}};
}

test('metadata edit sends only names and the viewed version without reading or uploading PNG pixels',async()=>{
 let reads=0;
 const env=fixture({readOne:async()=>{reads++;throw Error('Original should not be read');}});
 const [viewed]=await env.store.listAssets();assert.equal(reads,0);assert.equal(viewed.dataURL,undefined);
 const updated=await env.store.updateAsset({...viewed,name:'Nome editado'});
 assert.equal(reads,0);assert.deepEqual(env.writes,[]);
 assert.deepEqual(env.metadataWrites,[['logo',{name:'Nome editado',category:'Logos',_version:1}]]);
 assert.equal(updated._version,2);env.store.dispose();
});

test('a metadata refresh cannot replace the version captured for edit or delete confirmation',async()=>{
 let version=1;
 const env=fixture({read:async()=>[{...metadata,_version:version}],readOne:async()=>({...metadata,_version:version,dataURL:pixels}),updateMetadata:async(_id,value)=>{assert.equal(value._version,1);throw Error('Registro alterado');},remove:async(_resource,_id,options)=>{assert.equal(options.expectedVersion,1);throw Error('Registro alterado');}});
 const [viewed]=await env.store.listAssets();version=2;await env.store.listAssets();
 await assert.rejects(env.store.updateAsset({...viewed,name:'Edição antiga'}),/alterado/);assert.equal(env.writes.length,0);
 await assert.rejects(env.store.deleteAsset(viewed.id,viewed._version),/alterado/);env.store.dispose();
});

test('switching company during metadata persistence rejects its response for the next company',async()=>{
 const pending=deferred(),env=fixture({updateMetadata:()=>pending.promise});
 const editing=env.store.updateAsset({...metadata,name:'Novo nome'});
 env.switchContext({companyId:'b',user:{id:'user'}});pending.resolve({...metadata,dataURL:pixels});
 await assert.rejects(editing,/sessão ou empresa mudou/);assert.equal(env.writes.length,0);env.store.dispose();
});

test('returning to the same company after a session reset still rejects old work',async()=>{
 const pending=deferred(),env=fixture({readOne:()=>pending.promise});
 const reading=env.store.getAsset('logo',1);
 env.switchContext(null);env.switchContext({companyId:'a',user:{id:'user'}});pending.resolve({...metadata,dataURL:pixels});
 await assert.rejects(reading,/sessão ou empresa mudou/);env.store.dispose();
});

test('late metadata cannot repopulate the version cache after changing company',async()=>{
 const pending=deferred(),env=fixture({read:()=>pending.promise});
 const reading=env.store.listAssets();env.switchContext({companyId:'b',user:{id:'user'}});pending.resolve([{...metadata,_version:9}]);
 await assert.rejects(reading,/sessão ou empresa mudou/);assert.throws(()=>env.store.deleteAsset('logo'),/Atualize a biblioteca/);assert.equal(env.deletes.length,0);env.store.dispose();
});
