import test from 'node:test';
import assert from 'node:assert/strict';
import {repository} from '../shared/repository.js';
import {units,loadUnits} from '../interno/cadastros/unidades/state.js';
import {partners,loadPartners} from '../interno/cadastros/parceiros/state.js';
import {settings,loadSettings} from '../interno/configuracoes/state.js';
import {quotes,loadQuotes} from '../interno/cotacao/state.js';
import {productCategories,loadProductCategories} from '../interno/cadastros/categorias/state.js';

test('aplicação inicia sem cadastros ou operações de demonstração',()=>{
 assert.deepEqual(units,[]);assert.deepEqual(partners,[]);assert.deepEqual(quotes,[]);assert.deepEqual(productCategories,[]);
 assert.deepEqual(settings,{company:{},users:[],profiles:[],watermark:{},header:{}});
 assert.equal(repository.mode,'supabase');
});

test('sem sessão os repositórios exigem acesso ao banco, sem recorrer a dados locais',async()=>{
 for(const read of [loadUnits,loadPartners,loadSettings,loadQuotes,loadProductCategories,()=>repository.listProducts()]){
  await assert.rejects(read,/conta autorizada/);
 }
 await assert.rejects(repository.createProduct({name:'Exemplo',unit:'KG'}),/conta autorizada/);
 assert.deepEqual(units,[]);assert.deepEqual(partners,[]);assert.deepEqual(quotes,[]);
});
