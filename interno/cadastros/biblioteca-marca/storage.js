import {validateAsset} from './state.js';
let pendingDb;
async function database() {
  if (!globalThis.indexedDB) throw new Error('Armazenamento local indisponível. Use um navegador com IndexedDB habilitado.');
  if (!pendingDb) pendingDb = new Promise((resolve,reject) => {
    const request = indexedDB.open('supermercado-do-povo-biblioteca-marca',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'});
    request.onerror=()=>{pendingDb=undefined;reject(new Error('Não foi possível abrir a biblioteca local.'));};
    request.onblocked=()=>{pendingDb=undefined;reject(new Error('Feche outras abas e tente abrir a biblioteca novamente.'));};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();pendingDb=undefined;};resolve(db);};
  });
  return pendingDb;
}
async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve,reject) => {
    let tx, result;
    try {tx=db.transaction('assets',mode); const request=operation(tx.objectStore('assets'));request.onsuccess=()=>{result=request.result;};}
    catch(error) {reject(error);return;}
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'Espaço local insuficiente. O elemento não foi salvo.' : tx.error?.name === 'ConstraintError' ? 'Este identificador já existe na biblioteca.' : 'Não foi possível salvar a alteração na biblioteca local.'));
  });
}
export function createAssetStore(run = transaction) {
  return {
    async listAssets(){return (await run('readonly',s=>s.getAll())).map(validateAsset).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));},
    async addAsset(value){const asset=validateAsset(value);await run('readwrite',s=>s.add(asset));return {...asset};},
    async updateAsset(value){const asset=validateAsset(value);await run('readwrite',s=>s.put(asset));return {...asset};},
    async deleteAsset(id){if(typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))throw new Error('Identificador inválido.');await run('readwrite',s=>s.delete(id));}
  };
}
export const {listAssets,addAsset,updateAsset,deleteAsset}=createAssetStore();
