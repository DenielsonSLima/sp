const DB_NAME='supermercado-produtos';
const STORE='catalog';
export function createProductStorage(indexedDB=globalThis.indexedDB){
 let database,baseline,migrationSnapshot;
 const open=()=>database||(database=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(new Error('O armazenamento local não está disponível neste navegador.'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;baseline=undefined;migrationSnapshot=undefined;};resolve(db);};
  request.onerror=()=>reject(new Error('Não foi possível abrir o armazenamento dos produtos.'));
  request.onblocked=()=>reject(new Error('Feche outras abas para abrir o catálogo.'));
 }));
 const read=async(key)=>{const db=await open();return new Promise((resolve,reject)=>{let value;const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(key);request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível ler o catálogo salvo.'));});};
 return {
  async load({migrationId}={}){
   const db=await open();return new Promise((resolve,reject)=>{
    let records=[],marker;const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE),request=store.get('products');
    request.onsuccess=()=>{records=request.result||[];};
    if(migrationId){const metadata=store.get('migration:'+migrationId);metadata.onsuccess=()=>{marker=metadata.result;};}
    tx.oncomplete=()=>{baseline=JSON.stringify(records);migrationSnapshot=migrationId?{id:migrationId,applied:marker?.id===migrationId}:undefined;resolve(records);};
    tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível ler os produtos salvos.'));
   });
  },
  async hasMigration(id){if(migrationSnapshot?.id===id)return migrationSnapshot.applied;return (await read('migration:'+id))?.id===id;},
  async readMigrationBackup(id){return await read('backup:'+id)||[];},
  async save(records,{migration}={}){
   const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get('products');let conflict=false;const snapshot=JSON.stringify(records);
    request.onsuccess=()=>{
     if(JSON.stringify(request.result||[])!==baseline){conflict=true;tx.abort();return;}
     store.put(records,'products');
     if(migration){store.put(migration.backup,'backup:'+migration.id);store.put({id:migration.id,appliedAt:new Date().toISOString()},'migration:'+migration.id);}
    };
    tx.oncomplete=()=>{baseline=snapshot;if(migration)migrationSnapshot={id:migration.id,applied:true};resolve();};
    tx.onerror=tx.onabort=()=>reject(new Error(conflict?'O catálogo foi alterado em outra aba. Recarregue a página antes de salvar para preservar as alterações.':'Não foi possível salvar. Verifique o espaço disponível no navegador e tente novamente.'));
   });
  }
 };
}
