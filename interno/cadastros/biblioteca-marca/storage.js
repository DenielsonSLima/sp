import {validateAsset,validateCategory,categoryKey,CATEGORIES,UNCATEGORIZED} from './state.js';
let pendingDb;
export function upgradeLibrary(db, tx) {
  const assets=db.objectStoreNames.contains('assets') ? tx.objectStore('assets') : db.createObjectStore('assets',{keyPath:'id'});
  if (!db.objectStoreNames.contains('categories')) {
    const categories=db.createObjectStore('categories',{keyPath:'name'});
    CATEGORIES.forEach(name=>categories.put({name}));
    // Preserve every existing assignment, including categories from earlier versions.
    const cursor=assets.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){if(typeof row.value.category==='string' && row.value.category.trim())categories.put({name:row.value.category});row.continue();}};
  }
}
async function database() {
  if (!globalThis.indexedDB) throw new Error('Armazenamento local indisponível. Use um navegador com IndexedDB habilitado.');
  if (!pendingDb) pendingDb=new Promise((resolve,reject)=>{
    const request=indexedDB.open('supermercado-do-povo-biblioteca-marca',2);
    request.onupgradeneeded=()=>upgradeLibrary(request.result,request.transaction);
    request.onerror=()=>{pendingDb=undefined;reject(new Error('Não foi possível abrir a biblioteca local.'));};
    request.onblocked=()=>{pendingDb=undefined;reject(new Error('Feche outras abas e tente abrir a biblioteca novamente.'));};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();pendingDb=undefined;};resolve(db);};
  });
  return pendingDb;
}
async function atomic(mode, operation) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['assets','categories'],mode);let result,error;
    const finish=value=>{result=value;};
    const fail=value=>{error=value;tx.abort();};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(error || new Error(tx.error?.name==='QuotaExceededError'?'Espaço local insuficiente. A alteração não foi salva.':'Não foi possível salvar a alteração na biblioteca local.'));
    try{operation(tx.objectStore('assets'),tx.objectStore('categories'),finish,fail);}catch(err){fail(err);}
  });
}
async function transaction(mode,operation) {
  return atomic(mode,(assets,categories,finish)=>{const request=operation(assets);request.onsuccess=()=>finish(request.result);});
}
// Injectable asset adapter remains available for consumers and unit tests.
export function createAssetStore(run=transaction) {
  return {
    async listAssets(){return (await run('readonly',s=>s.getAll())).map(validateAsset).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));},
    async addAsset(value){const asset=validateAsset(value);await run('readwrite',s=>s.add(asset));return {...asset};},
    async updateAsset(value){const asset=validateAsset(value);await run('readwrite',s=>s.put(asset));return {...asset};},
    async deleteAsset(id){if(typeof id!=='string'||! /^[\w-]{1,100}$/.test(id))throw new Error('Identificador inválido.');await run('readwrite',s=>s.delete(id));}
  };
}
export const {listAssets,deleteAsset}=createAssetStore();
export function listCategories(){return atomic('readonly',(assets,categories,finish)=>{const req=categories.getAll();req.onsuccess=()=>finish(req.result.map(c=>c.name).sort((a,b)=>a.localeCompare(b,'pt-BR')));});}
function saveAsset(value,method){const asset=validateAsset(value);return atomic('readwrite',(assets,categories,finish,fail)=>{const req=categories.get(asset.category);req.onsuccess=()=>{if(!req.result){fail(new Error('A categoria não existe mais. Atualize a biblioteca.'));return;}const save=()=>{const saved=assets[method](asset);saved.onsuccess=()=>finish({...asset});};
      if(method==='put'){
        const existing=assets.get(asset.id);
        existing.onsuccess=()=>{if(!existing.result){fail(new Error('Este elemento foi excluído em outra aba. Feche a edição e atualize a biblioteca.'));return;}save();};
      }else save();};});}
export const addAsset=value=>saveAsset(value,'add');
export const updateAsset=value=>saveAsset(value,'put');
export function planCategoryChange(names, action, source, target) {
  const name=validateCategory(target ?? source);
  if(action!=='add' && (!names.includes(source) || source===UNCATEGORIZED))throw new Error('Esta categoria não pode ser alterada.');
  if(action==='remove') {
    if(source===name || !names.includes(name))throw new Error('Escolha outra categoria existente para os elementos.');
  } else if(names.some(existing=>existing!==source && categoryKey(existing)===categoryKey(name)) || (action==='add' && names.some(existing=>categoryKey(existing)===categoryKey(name))))throw new Error('Já existe uma categoria com esse nome.');
  return name;
}
function changeCategory(action,source,target){
  return atomic('readwrite',(assets,categories,finish,fail)=>{
    const req=categories.getAll();req.onsuccess=()=>{
      let name;try{name=planCategoryChange(req.result.map(c=>c.name),action,source,target);}catch(error){fail(error);return;}
      if(action!=='remove')categories.put({name});
      if(action==='add'){finish(name);return;}
      if(source!==name)categories.delete(source);
      const cursor=assets.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){if(row.value.category===source)row.update({...row.value,category:name});row.continue();}else finish(name);};
    };
  });
}
export const addCategory=name=>changeCategory('add',null,name);
export const renameCategory=(oldName,newName)=>changeCategory('rename',oldName,newName);
export const removeCategory=(name,reassignTo=UNCATEGORIZED)=>changeCategory('remove',name,reassignTo);
