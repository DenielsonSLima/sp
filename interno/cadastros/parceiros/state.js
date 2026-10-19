export const partnerTypes=['Fornecedor','Cliente','Ambos','Outro'];
export const partners=[{id:'partner-example',name:'Parceiro de exemplo',type:'Fornecedor',email:'parceiro@example.com',phone:''}];
export function addPartner(input){const name=String(input.name||'').trim();if(!name)throw new Error('Informe o nome do parceiro de exemplo.');if(!partnerTypes.includes(input.type))throw new Error('Selecione um tipo válido.');partners.push({id:globalThis.crypto.randomUUID(),name,type:input.type,email:String(input.email||'').trim(),phone:String(input.phone||'').trim()});}
