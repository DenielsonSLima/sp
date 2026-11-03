import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteProductRepository} from '../interno/cadastros/produtos/state.js';

test('remote catalog awaits units and returns authoritative RPC product payloads',async()=>{
 const calls=[];const serverRows=[{id:'product-1',name:'Arroz',unit:'unit-1',unitLabel:'UN · Unidade',_version:4}];
 const repository=createRemoteProductRepository({hydrateUnits:async()=>calls.push('units'),read:async resource=>{calls.push(resource);return serverRows;}});
 assert.deepEqual(await repository.listProducts(),serverRows);
 assert.deepEqual(calls,['units','products']);
});

test('remote update carries the form version so a stale editor cannot overwrite newer data',async()=>{
 let written;
 const repository=createRemoteProductRepository({hydrateUnits:async()=>{},readOne:async()=>({id:'product-1',name:'Servidor',unit:'unit-1',_version:8}),write:async(resource,record,options)=>{written={resource,record,options};throw Error('Registro alterado.');}});
 await assert.rejects(repository.updateProduct('product-1',{name:'Rascunho antigo',_version:3}),/Registro alterado/);
 assert.equal(written.resource,'products');assert.equal(written.record.name,'Rascunho antigo');assert.equal(written.options.expectedVersion,3);
});

test('remote creation propagates failure and product summary comes from server calculation',async()=>{
 const repository=createRemoteProductRepository({write:async()=>{throw Error('Sem permissão.');},compute:async kind=>{assert.equal(kind,'home_summary');return {products:125,quotes:2};}});
 await assert.rejects(repository.createProduct({name:'Produto'}),/Sem permissão/);
 assert.deepEqual(await repository.summary(),{products:125});
});


test('application catalogs stay empty until an authenticated database read succeeds, including under Node',async()=>{
 const [{units},{partners},{repository},{templates,loadTemplates},{listAssets},{productCategories}]=await Promise.all([
  import('../interno/cadastros/unidades/state.js'),import('../interno/cadastros/parceiros/state.js'),
  import('../interno/cadastros/produtos/state.js'),import('../interno/cadastros/modelos-cartaz/model.js'),
  import('../interno/cadastros/biblioteca-marca/storage.js'),import('../interno/cadastros/categorias/state.js')]);
 assert.deepEqual(units,[]);assert.deepEqual(partners,[]);assert.deepEqual(templates,[]);assert.deepEqual(productCategories,[]);
 assert.equal(repository.mode,'supabase');
 await assert.rejects(repository.listProducts(),/conta autorizada/);
 await assert.rejects(loadTemplates(),/conta autorizada/);
 await assert.rejects(listAssets(),/conta autorizada/);
 assert.deepEqual(templates,[]);
});

test('settings require canonical records and do not substitute local example profiles or company defaults',async()=>{
 const {createSettingsStore}=await import('../interno/configuracoes/state.js');
 const store=createSettingsStore({read:async()=>[]});
 assert.deepEqual(store.settings,{company:{},users:[],profiles:[],watermark:{},header:{}});
 await assert.rejects(store.loadSettings(),/não estão cadastradas no banco/);
 assert.deepEqual(store.settings.users,[]);assert.deepEqual(store.settings.profiles,[]);assert.deepEqual(store.settings.company,{});
});

test('settings mutations preserve server versions and expose database failures without local success',async()=>{
 const {createSettingsStore}=await import('../interno/configuracoes/state.js');
 const records={company_settings:[{id:'default',name:'Empresa do banco',_version:8}],user_access:[],profiles:[{id:'profile1',name:'Perfil do banco',modules:['inicio'],_version:1}],watermarks:[{id:'default',text:'Marca remota',_version:3}],headers:[{id:'default',title:'Cabeçalho remoto',_version:5}]};
 const writes=[];const store=createSettingsStore({read:async resource=>structuredClone(records[resource]),write:async(resource,input,options)=>{writes.push({resource,input,options});throw Error('Atualização recusada no banco.');}});
 await store.loadSettings();
 await assert.rejects(store.saveCompany({name:'Alteração pendente',_version:7}),/recusada/);
 assert.equal(writes[0].options.expectedVersion,7);assert.equal(store.settings.company.name,'Empresa do banco');
 await assert.rejects(store.addUser({name:'Pessoa',email:'pessoa@example.com',profile:'Perfil do banco'}),/recusada/);
 assert.deepEqual(store.settings.users,[]);
});
