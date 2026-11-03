import {isPhotoData} from '../../interno/cadastros/produtos/photo.js';
const defaultUnits=['UN','KG','G','PCT','CX','L'].map(id=>({id}));
// In-memory demo adapter. No remote or persistent storage.
export function createDemoRepository({units=defaultUnits}={}){
 const records=[{id:'demo-1',name:'Arroz branco 1 kg',category:'Mercearia',unit:'UN',photo:''},{id:'demo-2',name:'Feijão carioca 1 kg',category:'Mercearia',unit:'UN',photo:''},{id:'demo-3',name:'Café torrado 250 g',category:'Mercearia',unit:'UN',photo:''}];
 return {mode:'demo',async listProducts(){return records.map(item=>({...item}));},async createProduct(input){const name=String(input.name||'').trim();if(!name)throw new Error('Informe o nome do produto.');if(!units.some(u=>u.id===input.unit))throw new Error('Selecione uma unidade cadastrada.');const photo=String(input.photo||'');if(!isPhotoData(photo))throw new Error('Foto inválida.');const item={id:globalThis.crypto.randomUUID(),name,category:String(input.category||'').trim()||'Sem categoria',unit:input.unit,photo};records.push(item);return {...item};},async updateProductPhoto(id,photo){const item=records.find(p=>p.id===id);if(!item)throw new Error('Produto não encontrado.');if(!isPhotoData(photo))throw new Error('Foto inválida.');item.photo=photo;return {...item};},async summary(){return {products:records.length};}};
}
