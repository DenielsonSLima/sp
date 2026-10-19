import {validateDesign, newId, MAX_JSON_BYTES} from './model.js';
const DATABASE = 'supermercado-do-povo-encartes';
const STORE = 'designs';
let pendingDb;
function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Armazenamento local indisponível neste navegador. Exporte um backup JSON para guardar sua arte.'));
  if (!pendingDb) pendingDb = new Promise((resolve,reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'id'}); };
    request.onerror = () => { pendingDb = undefined; reject(new Error('Não foi possível abrir o armazenamento local. Exporte um backup JSON.')); };
    request.onblocked = () => { pendingDb = undefined; reject(new Error('O armazenamento local está bloqueado por outra aba. Feche outras abas e tente novamente.')); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => {db.close(); pendingDb = undefined;}; resolve(db); };
  });
  return pendingDb;
}
async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve,reject) => {
    let tx, result;
    try { tx = db.transaction(STORE,mode); const request = operation(tx.objectStore(STORE)); request.onsuccess = () => {result = request.result;}; }
    catch (error) { reject(new Error(`Falha no armazenamento local: ${error.message}`)); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'Espaço local insuficiente. Exporte um backup JSON e libere espaço.' : 'Não foi possível concluir a operação no armazenamento local. Exporte um backup JSON.'));
  });
}
export async function saveDesign(design) {
  const normalized = validateDesign({...design,updatedAt:new Date().toISOString()});
  await transaction('readwrite',store => store.put(normalized));
  return normalized;
}
export async function listDesigns() { const records = await transaction('readonly',store => store.getAll()); return records.map(validateDesign).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function deleteDesign(id) { await transaction('readwrite',store => store.delete(id)); }
export async function getDesign(id) { const record = await transaction('readonly',store => store.get(id)); return record ? validateDesign(record) : null; }
export function exportDesignJson(design) { return JSON.stringify(validateDesign(design)); }
export function parseDesignJson(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error('O backup deve ser um JSON de até 25 MB.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('O arquivo não contém um JSON válido.'); }
  const design = validateDesign(value), now = new Date().toISOString();
  return {...design,id:newId(),status:'draft',createdAt:now,updatedAt:now};
}
