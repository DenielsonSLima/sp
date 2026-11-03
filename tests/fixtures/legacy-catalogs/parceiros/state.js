import {isRemoteMode,listRecords,saveRecord,replaceRows,clearOnContextChange} from '../remote.js';
export const partnerTypes=['Fornecedor','Cliente','Ambos','Outro'];
export const partners=isRemoteMode()?[]:[{id:'partner-example',name:'Parceiro',type:'Fornecedor',email:'parceiro@example.com',phone:''}];
export function addPartner(input){if(isRemoteMode())return saveRecord('partners',input).then(saved=>{const index=partners.findIndex(row=>row.id===saved.id);if(index<0)partners.push(saved);else partners[index]=saved;return saved;});const name=String(input.name||'').trim();if(!name)throw new Error('Informe o nome do parceiro.');if(!partnerTypes.includes(input.type))throw new Error('Selecione um tipo válido.');partners.push({id:globalThis.crypto.randomUUID(),name,type:input.type,email:String(input.email||'').trim(),phone:String(input.phone||'').trim()});}

export async function loadPartners(){if(isRemoteMode())replaceRows(partners,await listRecords('partners'));return partners;}

clearOnContextChange('partners',()=>partners.splice(0));
