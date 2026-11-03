import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductRepository} from './fixtures/legacy-catalogs/produtos/state.js';
const photo='data:image/png;base64,AAAA';
const initial=[{id:'horti-edited',name:'Tomate italiano',category:'Hortifruti',unit:'KG',code:'123',photos:[photo]},{id:'old',name:'Arroz exemplo',category:'Mercearia',unit:'UN'}];
const migration={id:'renewal-v1',keep:row=>row.category==='Hortifruti',seeds:[{id:'new',name:'Biscoito Vitarella 350 g',category:'Mercearia',unit:'UN',brand:'Vitarella',asset:'biscoito.png'}]};
function storage(){let records=structuredClone(initial),applied=false,backup;return {load:async()=>structuredClone(records),hasMigration:async()=>applied,async save(next,options={}){records=structuredClone(next);if(options.migration){backup=structuredClone(options.migration.backup);applied=true;}},get backup(){return backup;}};}
test('catalog renewal preserves existing vegetables exactly, replaces other products and stores a backup',async()=>{
 const store=storage(),repo=createProductRepository({storage:store,migration,loadSeedPhoto:async()=>photo});
 const rows=await repo.listProducts();assert.equal(rows.length,2);assert.equal(rows.find(row=>row.id==='old'),undefined);
 const vegetable=rows.find(row=>row.id==='horti-edited');assert.equal(vegetable.name,'Tomate italiano');assert.equal(vegetable.code,'123');assert.deepEqual(vegetable.photos,[photo]);
 const branded=rows.find(row=>row.id==='new');assert.equal(branded.category,'Mercearia');assert.equal(branded.unit,'UN');assert.equal(branded.brand,'Vitarella');assert.equal(branded.photo,photo);assert.equal(branded.price,undefined);
 assert.equal(store.backup.length,2);assert.equal(store.backup[1].id,'old');
 await repo.updateProduct('new',{name:'Nome ajustado'});await repo.createProduct({name:'Produto cadastrado depois',unit:'UN'});
 const reload=await createProductRepository({storage:store,migration,loadSeedPhoto:async()=>{throw Error('Do not reload');}}).listProducts();
 assert.equal(reload.length,3);assert.equal(reload.find(row=>row.id==='new').name,'Nome ajustado');assert.equal(store.backup.length,2);
});
test('failed image loading or saving leaves old catalog intact and allows a complete retry',async()=>{
 const store=storage();let fail=true;
 const repo=createProductRepository({storage:store,migration,loadSeedPhoto:async()=>{if(fail)throw Error('Image unavailable');return photo;}});
 await assert.rejects(repo.listProducts(),/Image unavailable/);assert.equal((await store.load())[1].id,'old');assert.equal(await store.hasMigration(),false);assert.equal(store.backup,undefined);
 fail=false;assert.equal((await repo.listProducts()).find(row=>row.id==='new').photo,photo);
 const originalSave=store.save;store.hasMigration=async()=>false;store.save=async()=>{throw Error('Quota');};
 const second=createProductRepository({storage:store,migration,loadSeedPhoto:async()=>photo});await assert.rejects(second.listProducts(),/Quota/);store.save=originalSave;
});
