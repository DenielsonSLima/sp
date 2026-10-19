// Repository contract: asynchronous list/create/summary methods. Replace this
// in-memory adapter with a reviewed database adapter when backend is authorized.
export function createDemoRepository(){
 const records=[{id:'demo-1',name:'Arroz branco 1 kg',category:'Mercearia',unit:'UN'},{id:'demo-2',name:'Feijão carioca 1 kg',category:'Mercearia',unit:'UN'},{id:'demo-3',name:'Café torrado 250 g',category:'Mercearia',unit:'UN'}];
 return {mode:'demo',async listProducts(){return records.map(item=>({...item}));},async createProduct(input){const name=String(input.name||'').trim();if(!name)throw new Error('Informe o nome do produto.');const item={id:globalThis.crypto.randomUUID(),name,category:String(input.category||'').trim()||'Sem categoria',unit:['UN','KG','CX'].includes(input.unit)?input.unit:'UN'};records.push(item);return {...item};},async summary(){return {products:records.length};}};
}
export const repository=createDemoRepository();
