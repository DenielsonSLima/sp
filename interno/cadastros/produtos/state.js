import {units,unitLabel} from '../unidades/state.js';
import {validateGallery,isPhotoData} from './photo.js';
import {createProductStorage} from './storage.js';
import {productSeeds,catalogMigration} from './seeds.js';
const clone=value=>structuredClone(value);
export function normalizeProductCode(value){const code=String(value??'').trim();if(code.length>40)throw new Error('O código do produto deve ter até 40 caracteres.');return code;}
const codeKey=value=>normalizeProductCode(value).toLocaleLowerCase('pt-BR');
function checkCode(records,item){if(item.code&&records.some(row=>row.id!==item.id&&codeKey(row.code)===codeKey(item.code)))throw new Error('Já existe um produto com este código.');}
export function createProductRepository({storage=null,initial=[],seeds=[],migration=null,loadSeedPhoto=async path=>{const response=await fetch(path);if(!response.ok)throw new Error('Não foi possível carregar as fotos do catálogo.');const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}={}){
 let records=clone(initial),ready,migrationDone=false,queue=Promise.resolve();
 const normalize=(input,{validateUnit=true}={})=>{const name=String(input.name||'').trim();if(!name)throw new Error('Informe o nome do produto.');if(name.length>100)throw new Error('Use até 100 caracteres no nome.');if(validateUnit&&!units.some(u=>u.id===input.unit))throw new Error('Selecione uma unidade cadastrada.');const photos=validateGallery(input.photos??(input.photo?[input.photo]:[]));return {...input,name,code:normalizeProductCode(input.code),category:String(input.category||'').trim()||'Sem categoria',unit:input.unit,unitLabel:units.some(u=>u.id===input.unit)?unitLabel(input.unit):(input.unitLabel||input.unit),photos,photo:photos[0]||'',image:photos[0]||''};};
 const init=()=>ready||(ready=(async()=>{
  records=(storage?await storage.load({migrationId:migration?.id}):records).map(item=>normalize(item,{validateUnit:false}));
  const migrate=Boolean(migration&&!(storage?await storage.hasMigration(migration.id):migrationDone));
  const next=clone(migrate?records.filter(migration.keep):records);
  for(const seed of [...seeds,...(migrate?migration.seeds:[])]){
   const category=seed.category||'Hortifruti';
   if(next.some(p=>p.id===seed.id||p.name.toLocaleLowerCase('pt-BR')===seed.name.toLocaleLowerCase('pt-BR')&&p.category===category))continue;
   const {asset,...fields}=seed;
   const photo=await loadSeedPhoto(asset);
   next.push(normalize({...fields,category,unit:seed.unit||'KG',photo}));
  }
  if(storage&&(migrate||next.length!==records.length))await storage.save(next,migrate?{migration:{id:migration.id,backup:records}}:{});
  records=next;
  if(migrate)migrationDone=true;
 })().catch(error=>{ready=null;throw error;}));
 const mutate=operation=>{const task=queue.then(async()=>{await init();const next=clone(records);const result=operation(next);if(storage)await storage.save(next);records=next;return clone(result);});queue=task.catch(()=>{});return task;};
 return {mode:storage?'local':'memory',async listProducts(){await init();return clone(records);},async getProduct(id){await init();return clone(records.find(p=>p.id===id)||null);},createProduct(input){return mutate(next=>{const item=normalize({...input,id:globalThis.crypto.randomUUID()});checkCode(next,item);next.push(item);return item;});},updateProduct(id,input){return mutate(next=>{const index=next.findIndex(p=>p.id===id);if(index<0)throw new Error('Produto não encontrado.');const item=normalize({...next[index],...input,id},{validateUnit:input.unit!==undefined&&input.unit!==next[index].unit});checkCode(next,item);next[index]=item;return item;});},updateProductPhotos(id,photos){return this.updateProduct(id,{photos:validateGallery(photos)});},updateProductPhoto(id,photo){if(!isPhotoData(photo))return Promise.reject(new Error('Foto inválida.'));return this.updateProductPhotos(id,photo?[photo]:[]);},async summary(){await init();return {products:records.length};}};
}
export const repository=createProductRepository({storage:createProductStorage(),seeds:productSeeds,migration:catalogMigration});
