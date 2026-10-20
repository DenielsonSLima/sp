import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCategory,validateAsset,snapshotAsset,CATEGORIES,UNCATEGORIZED} from '../interno/cadastros/biblioteca-marca/state.js';
import {planCategoryChange,upgradeLibrary} from '../interno/cadastros/biblioteca-marca/storage.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=';
test('dynamic category names validate and immutable snapshots accept user-created categories',()=>{
 assert.equal(validateCategory('  Festas locais  '),'Festas locais');
 for(const value of ['',null,'x'.repeat(81),'bad\nname'])assert.throws(()=>validateCategory(value));
 const a=validateAsset({id:'abc',name:'Faixa',category:'São João',dataURL:png,width:1,height:1});const copy=snapshotAsset(a);a.category='Outra';assert.equal(copy.category,'São João');assert.equal(copy.dataURL,png);
 for(const name of ['Supermercado do Povo','Cabeçalho','Marca d’água','Formas',UNCATEGORIZED])assert.ok(CATEGORIES.includes(name));
});
test('category mutation validates duplicates, protected fallback and existing reassignment targets',()=>{
 const names=['Cabeçalho','Logos',UNCATEGORIZED];
 assert.equal(planCategoryChange(names,'add',null,'Formas'),'Formas');
 assert.throws(()=>planCategoryChange(names,'add',null,' CABECALHO '),/Já existe/);
 assert.equal(planCategoryChange(names,'rename','Logos','Logo oficial'),'Logo oficial');
 assert.throws(()=>planCategoryChange(names,'rename','Logos','cabeçalho'),/Já existe/);
 assert.throws(()=>planCategoryChange(names,'rename',UNCATEGORIZED,'Outras'),/não pode/);
 assert.throws(()=>planCategoryChange(names,'remove',UNCATEGORIZED,'Logos'),/não pode/);
 assert.throws(()=>planCategoryChange(names,'remove','Logos','Logos'),/outra/);
 assert.throws(()=>planCategoryChange(names,'remove','Logos','Desconhecida'),/outra/);
 assert.equal(planCategoryChange(names,'remove','Logos',UNCATEGORIZED),UNCATEGORIZED);
});
test('v1 migration retains assets and every legacy category without clearing or rebuilding assets',()=>{
 const rows=[{category:'Logos',dataURL:png},{category:'Minha categoria antiga',dataURL:png}];let index=0;const names=new Set(),request={};let assetCreates=0;
 const assets={openCursor:()=>request};
 const db={objectStoreNames:{contains:name=>name==='assets'},createObjectStore:(name)=>{assert.equal(name,'categories');return {put:({name})=>names.add(name)};}};
 upgradeLibrary(db,{objectStore:name=>{assetCreates++;assert.equal(name,'assets');return assets;}});
 for(const row of rows){request.result={value:row,continue:()=>index++};request.onsuccess();}request.result=null;request.onsuccess();
 assert.equal(assetCreates,1);assert.equal(index,2);assert.equal(rows[0].dataURL,png);assert.ok(names.has('Minha categoria antiga'));assert.ok(names.has('Logos'));assert.ok(names.has(UNCATEGORIZED));
});
test('library and editor consume shared dynamic catalog and escape category names',async()=>{
 const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
 const panel=await read('interno/encartes/brand-panel.js'),module=await read('interno/cadastros/biblioteca-marca/index.js'),categories=await read('interno/cadastros/biblioteca-marca/categories.js'),storage=await read('interno/cadastros/biblioteca-marca/storage.js');
 assert.match(panel,/listCategories/);assert.doesNotMatch(panel,/const categories=\[/);assert.match(panel,/escapeHtml\(c\)/);
 assert.match(module,/escapeHtml\(a.category\)/);assert.match(categories,/escapeHtml\(name\)/);assert.match(categories,/Nenhum PNG será excluído/);assert.match(categories,/Remover e mover elementos/);
 assert.match(storage,/db.transaction\(\['assets','categories'\],mode\)/);assert.match(storage,/row.update\(\{\.\.\.row.value,category:name\}\)/);assert.doesNotMatch(storage,/assets\.clear|deleteDatabase/);
 assert.match(module,/brand-query/);assert.doesNotMatch(module,/q\('\[type=search\]'\)/);
});
