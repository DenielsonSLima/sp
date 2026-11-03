import {isRemoteMode,listRecords,saveRecord,replaceRows,clearOnContextChange} from '../remote.js';
export const units=isRemoteMode()?[]:[{id:'UN',symbol:'UN',name:'Unidade'},{id:'KG',symbol:'KG',name:'Quilograma'},{id:'G',symbol:'G',name:'Gramas'},{id:'PCT',symbol:'PCT',name:'Pacote'},{id:'CX',symbol:'CX',name:'Caixa'},{id:'L',symbol:'L',name:'Litro'}];
export const unitLabel=id=>{const unit=units.find(u=>u.id===id);return unit?`${unit.symbol} · ${unit.name}`:id;};
export function saveUnit(input){if(isRemoteMode())return saveRecord('units',input).then(saved=>{const index=units.findIndex(row=>row.id===saved.id);if(index<0)units.push(saved);else units[index]=saved;return saved;});const name=String(input.name||'').trim(),symbol=String(input.symbol||'').trim().toLocaleUpperCase('pt-BR');if(!name||!symbol)throw new Error('Preencha o nome e a sigla da unidade.');if(symbol.length>8||name.length>60)throw new Error('Use até 8 caracteres na sigla e 60 no nome.');if(units.some(u=>u.symbol.toLocaleUpperCase('pt-BR')===symbol&&u.id!==input.id))throw new Error('Já existe uma unidade com esta sigla.');if(input.id){const unit=units.find(u=>u.id===input.id);if(!unit)throw new Error('Unidade não encontrada.');Object.assign(unit,{name,symbol});return {...unit};}const unit={id:crypto.randomUUID(),name,symbol};units.push(unit);return {...unit};}

export async function loadUnits(){if(isRemoteMode())replaceRows(units,await listRecords('units'));return units;}

clearOnContextChange('units',()=>units.splice(0));
