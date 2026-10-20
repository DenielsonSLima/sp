import {lineInput,today} from './model.js';
const records=new Map();
export function getDraft(key,record){if(!records.has(key))records.set(key,{partnerId:record?.partner.id||'',date:record?.date||today(),notes:record?.notes||'',responsible:'',items:record?record.items.map(lineInput):[]});return records.get(key);}
export const clearDraft=key=>records.delete(key);
export const replaceItems=(key,record)=>{const draft=getDraft(key,record);draft.items=record.items.map(lineInput);return draft;};
