import {restoreSession,onAuthChange} from '../shared/data/auth.js';
import * as api from '../shared/data/api.js';
import {supabaseConfig} from '../shared/data/config.js';
// Copied by prepare-session-import one level below the application root; never shipped by build.
export const companyId='89d1d8c9-b03d-46aa-a743-deac900f93b3',projectRef='enhoierfwuwtzulznjxa';
const expectedUrl='https://'+projectRef+'.supabase.co';
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const validText=(value,max)=>typeof value==='string'&&Boolean(value.trim())&&value.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const safeId=value=>typeof value==='string'&&/^[-\w]{1,100}$/.test(value);
export function validatePreparedManifest(value){
 if(!value||value.projectRef!==projectRef||value.companyId!==companyId||!Array.isArray(value.products)||!Array.isArray(value.assets))throw Error('Manifesto fora do projeto autorizado ou incompleto.');
 const fileValid=file=>file&&/^[a-f0-9]{64}$/.test(file.sha256)&&file.url==='./files/'+file.sha256+'.png'&&Number.isSafeInteger(file.size)&&file.size>32&&file.size<=8*1024*1024&&Number.isInteger(file.width)&&Number.isInteger(file.height)&&file.width>0&&file.height>0;
 const seenCodes=new Set(),seenNames=new Set(),seenAssets=new Set(),seenAssetNames=new Set();
 for(const product of value.products){
  if(!product||!/^reviewed-product-[a-f0-9]{24}$/.test(product.id)||!validText(product.name,100)||!validText(product.code,40)||!validText(product.category,80)||!validText(product.subcategory,80)||!safeId(product.unit)||!Array.isArray(product.photos)||product.photos.length!==3||Object.keys(product).some(key=>/price|preco|preço|promotion/i.test(key)))throw Error('Produto revisado inválido.');
  if(seenCodes.has(fold(product.code))||seenNames.has(fold(product.name)))throw Error('Produto repetido no lote revisado.');seenCodes.add(fold(product.code));seenNames.add(fold(product.name));
  if(new Set(product.photos.map(photo=>photo?.angle)).size!==3||new Set(product.photos.map(photo=>photo?.sha256)).size!==3||product.photos.some(photo=>!fileValid(photo)||photo.width<1024||photo.height<1024||photo.width>12000||photo.height>12000||photo.width*photo.height>40000000||!['front','left','right'].includes(photo.angle)||photo.source!=='generated'))throw Error('Fotos revisadas inválidas.');
 }
 for(const asset of value.assets){
  if(!asset||!safeId(asset.id)||!validText(asset.name,100)||!validText(asset.category,80)||!fileValid(asset)||asset.width>10000||asset.height>10000||asset.width*asset.height>20000000)throw Error('PNG revisado da Biblioteca inválido.');
  const key=fold(asset.category)+'|'+fold(asset.name);if(seenAssets.has(asset.id)||seenAssetNames.has(key))throw Error('PNG repetido no lote revisado.');seenAssets.add(asset.id);seenAssetNames.add(key);
 }
 return value;
}
export function selectImportProduct(input,catalog){
 const byId=catalog.find(row=>row.id===input.id),byCode=catalog.filter(row=>fold(row.code)===fold(input.code)),byName=catalog.filter(row=>fold(row.name)===fold(input.name));
 if(byCode.length>1)throw Error('Há códigos duplicados no catálogo. Revisar: '+input.code);
 if(byId&&(fold(byId.code)!==fold(input.code)||fold(byId.name)!==fold(input.name)||byId.unit!==input.unit||fold(byId.category)!==fold(input.category)||(byId.subcategory&&fold(byId.subcategory)!==fold(input.subcategory))))return {action:'preserve',record:byId,reason:'Cadastro do lote foi editado; conteúdo preservado'};
 if(byId&&byCode[0]?.id===byId.id&&!byName.some(row=>row.id!==byId.id))return {action:'resume',record:byId};
 const record=byCode[0]??byName[0];return record?{action:'preserve',record,reason:'Produto já existente por código ou nome'}:{action:'create'};
}
const upsert=(rows,value)=>{const index=rows.findIndex(row=>row.id===value.id);if(index<0)rows.push(value);else rows[index]=value;};
const hashBytes=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
export async function readReviewedData(file){
 const response=await fetch(file.url,{cache:'no-store'});if(!response.ok)throw Error('Arquivo revisado não encontrado.');
 const bytes=await response.arrayBuffer(),view=new DataView(bytes),signature=new Uint8Array(bytes,0,Math.min(8,bytes.byteLength));
 if(bytes.byteLength!==file.size||bytes.byteLength<33||[137,80,78,71,13,10,26,10].some((byte,index)=>signature[index]!==byte)||view.getUint32(16)!==file.width||view.getUint32(20)!==file.height||await hashBytes(bytes)!==file.sha256)throw Error('Os pixels ou dimensões divergem do manifesto revisado.');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Falha ao ler PNG.'));reader.readAsDataURL(new Blob([bytes],{type:'image/png'}));});
}
export async function verifyRemotePhotos(record,input,{assertCurrent=()=>{},fetcher=fetch}={}){
 const refs=record.photoAssets??[],legacy=record.legacyPhotos??[];
 if(refs.length!==3||legacy.length||!record.subcategoryId)throw Error('Galeria ou classificação remota incompleta: '+input.code);
 for(const photo of input.photos){
  const matches=refs.filter(asset=>asset.angle===photo.angle&&asset.source==='generated');
  if(matches.length!==1)throw Error('Ângulos remotos não correspondem ao lote revisado.');
  const asset=matches[0],entry=record.photoEntries?.find(entry=>entry.asset?.path===asset.path);
  if(asset.size!==photo.size||asset.width!==photo.width||asset.height!==photo.height||!entry?.src)throw Error('Metadados da foto remota não correspondem ao lote revisado.');
  assertCurrent();const response=await fetcher(entry.src);if(!response.ok)throw Error('Falha ao baixar foto remota para conferência.');
  const bytes=await response.arrayBuffer();assertCurrent();
  if(bytes.byteLength!==photo.size||await hashBytes(bytes)!==photo.sha256)throw Error('Foto remota diverge do PNG aprovado.');
 }
 return true;
}

/** Mutations are never blindly retried. Re-read deterministic IDs after an ambiguous response. */
export function createReviewedImporter({data=api,assertCurrent=()=>{},readData=readReviewedData,verifyPhotos=verifyRemotePhotos,report=()=>{}}={}){
 const uploads=new Map();
 const freshList=async resource=>{assertCurrent();const rows=await data.listRecords(resource,{force:true});assertCurrent();return rows;};
 const freshCatalog=async()=>{assertCurrent();data.queryClient?.removeQueries({queryKey:['sp',companyId,'products','metadata']});const rows=await data.listProductMetadata();assertCurrent();return rows;};
 const freshRecord=async(resource,id)=>{assertCurrent();data.queryClient?.removeQueries({queryKey:['sp',companyId,resource,'detail',String(id)]});const row=await data.getRecord(resource,id);assertCurrent();return row;};
 async function category(name,parentId=null){
  let rows=await freshList('product_categories'),found=rows.find(row=>fold(row.name)===fold(name)&&(row.parentId||null)===parentId);
  if(!found){assertCurrent();try{found=await data.saveRecord('product_categories',{id:crypto.randomUUID(),name,parentId});assertCurrent();}catch(error){assertCurrent();rows=await freshList('product_categories');found=rows.find(row=>fold(row.name)===fold(name)&&(row.parentId||null)===parentId);if(!found)throw error;}report({phase:'category',name:found.name,parentId});}
  return found;
 }
 async function product(input){
  assertCurrent();let selection=selectImportProduct(input,await freshCatalog());
  if(selection.action==='preserve'){const result={id:selection.record.id,code:input.code,preserved:true,reason:selection.reason};report({phase:'preserved',...result});return result;}
  const main=await category(input.category),sub=await category(input.subcategory,main.id);let live;
  if(selection.action==='create'){
   // Resolve again after category writes; another operator may have added the product.
   selection=selectImportProduct(input,await freshCatalog());
   if(selection.action==='preserve'){const result={id:selection.record.id,code:input.code,preserved:true,reason:selection.reason};report({phase:'preserved',...result});return result;}
   if(selection.action==='create'){
    const {photos,subcategory,...fields}=input;assertCurrent();
    try{await data.saveRecord('products',{...fields,category:main.name,subcategoryId:sub.id,photos:[]});assertCurrent();}
    catch(error){assertCurrent();const recovered=selectImportProduct(input,await freshCatalog());if(recovered.action!=='resume')throw error;report({phase:'reconciled',code:input.code,id:input.id});}
   }
  }
  live=await freshRecord('products',input.id);if(!live)throw Error('O cadastro do lote não está disponível.');
  if(selectImportProduct(input,[live]).action!=='resume')throw Error('O produto foi editado durante a importação. Conteúdo preservado.');
  if(!live.subcategoryId){
   // Keep all stored fields and stable gallery references; drop only browser media aliases.
   const {photo,photos,photoEntries,legacyPhotos,image,hasPhotos,photoCount,...fields}=live;assertCurrent();
   live=await data.saveRecord('products',{...fields,category:main.name,subcategoryId:sub.id},{expectedVersion:live._version});assertCurrent();
  }
  const hasPhotos=(live.photoAssets?.length||0)+(live.legacyPhotos?.length||0)>0;
  if(!hasPhotos){
   const refs=[];
   for(const photo of input.photos){
    const key=input.id+'|'+photo.sha256;let ref=uploads.get(key);
    if(!ref){assertCurrent();const source=await readData(photo);assertCurrent();const uploaded=await data.uploadProductPhoto(live.id,source);assertCurrent();ref={...uploaded,width:photo.width,height:photo.height,angle:photo.angle,source:'generated',position:refs.length};uploads.set(key,ref);}
    refs.push({...ref,position:refs.length});
   }
   // A concurrent change must reject; never merge/replace someone else's new gallery.
   assertCurrent();try{await data.saveProductGallery(live.id,{photoAssets:refs,legacyPhotos:[]},{expectedVersion:live._version});assertCurrent();}
   catch(error){assertCurrent();const recovered=await freshRecord('products',live.id);if(!(recovered?.photoAssets?.length))throw error;await verifyPhotos(recovered,input,{assertCurrent});report({phase:'reconciled-gallery',code:input.code,id:live.id});}
  }
  const verified=await freshRecord('products',live.id);await verifyPhotos(verified,input,{assertCurrent});assertCurrent();
  const result={code:input.code,id:live.id,version:verified._version,category:verified.category,subcategory:verified.subcategory,photoAssets:verified.photoAssets.map(asset=>({path:asset.path,angle:asset.angle,width:asset.width,height:asset.height,size:asset.size,source:asset.source})),sha256Verified:true};
  report({phase:'verified',code:input.code,photos:3,category:verified.category,subcategory:verified.subcategory});return result;
 }
 async function asset(input){
  let rows=await freshList('brand_assets');const byId=rows.find(row=>row.id===input.id),same=rows.find(row=>fold(row.name)===fold(input.name)&&fold(row.category)===fold(input.category));
  if(byId||same){
   const found=byId??same;
   if(byId&&byId.name===input.name&&fold(byId.category)===fold(input.category)&&byId.width===input.width&&byId.height===input.height){
    const expected=await readData(input);assertCurrent();const full=await freshRecord('brand_assets',byId.id);
    if(full?.dataURL===expected){const result={id:byId.id,name:byId.name,category:byId.category,width:byId.width,height:byId.height,sha256:input.sha256,version:byId._version,sha256Verified:true};report({phase:'verified-existing',asset:input.name,id:byId.id});return result;}
   }
   report({phase:'preserved',asset:input.name,id:found.id});return {id:found.id,name:found.name,category:found.category,preserved:true};
  }
  let categories=await freshList('brand_categories'),category=categories.find(row=>fold(row.name)===fold(input.category));
  if(!category){assertCurrent();try{category=await data.saveRecord('brand_categories',{action:'add',name:input.category,target:input.category});assertCurrent();}catch(error){assertCurrent();categories=await freshList('brand_categories');category=categories.find(row=>fold(row.name)===fold(input.category));if(!category)throw error;}}
  const dataURL=await readData(input);assertCurrent();let saved;
  try{saved=await data.saveRecord('brand_assets',{id:input.id,name:input.name,category:category.name,width:input.width,height:input.height,dataURL});assertCurrent();}
  catch(error){assertCurrent();saved=await freshRecord('brand_assets',input.id);if(!saved||saved.dataURL!==dataURL||saved.category!==category.name||saved.name!==input.name)throw error;report({phase:'reconciled',asset:input.name,id:input.id});}
  const verified=await freshRecord('brand_assets',saved.id);if(verified.dataURL!==dataURL||verified.category!==category.name||verified.width!==input.width||verified.height!==input.height)throw Error('O PNG da biblioteca não confere após salvar.');
  const result={id:saved.id,name:saved.name,category:saved.category,width:saved.width,height:saved.height,sha256:input.sha256,version:verified._version};report({phase:'verified',asset:saved.name,category:saved.category});return result;
 }
 return {freshCatalog,product,asset};
}

export async function startReviewConsole(){
 const $=selector=>document.querySelector(selector);let manifest,actorId,running=false,sessionInvalid=false;
 const evidence={projectRef,companyId,startedAt:new Date().toISOString(),products:[],assets:[]};
 const log=value=>{$('#log').textContent+=(typeof value==='string'?value:JSON.stringify(value))+'\n';};
 function current(){const context=api.getDataContext();if(sessionInvalid||!actorId||context?.companyId!==companyId||context?.user?.id!==actorId||!context.companies?.some(company=>company.id===companyId&&['owner','admin'].includes(company.role)))throw Error('A sessão ou empresa mudou. Operação interrompida; recarregue para conferir novamente.');}
 const importer=createReviewedImporter({assertCurrent:current,report:log});
 async function refresh(){
  current();const catalog=await importer.freshCatalog(),categories=await api.listRecords('product_categories',{force:true});current();
  const missing=catalog.filter(product=>!product.category||!product.subcategoryId);log({phase:'catalog',products:catalog.length,categories:categories.length,withoutCategory:catalog.filter(product=>!product.category).length,withoutSubcategory:missing.length});
  $('#plan').replaceChildren();
  for(const product of manifest.products){const item=document.createElement('p'),selection=selectImportProduct(product,catalog);item.textContent=`${selection.action==='preserve'?'Preservar existente':'Cadastrar / retomar'} · ${product.code} · ${product.name} · ${product.category} / ${product.subcategory} · 3 fotos`;$('#plan').append(item);}
  for(const asset of manifest.assets){const item=document.createElement('p');item.textContent=`Biblioteca: ${asset.category} / ${asset.name}`;$('#plan').append(item);}
  if(!manifest.products.length&&!manifest.assets.length)for(const product of catalog){const item=document.createElement('p');item.textContent=`${product.id} | ${product.code} | ${product.name} | ${product.category} / ${product.subcategory}`;$('#plan').append(item);}
  $('#status').textContent=`Sessão autorizada. ${catalog.length} produtos atuais. Lote: ${manifest.products.length} produtos e ${manifest.assets.length} PNGs da Biblioteca.`;return catalog;
 }
 async function apply(){
  if(running)return;running=true;$('#apply').disabled=true;$('#refresh').disabled=true;
  try{
   current();await refresh();
   for(const product of manifest.products)upsert(evidence.products,await importer.product(product));
   for(const asset of manifest.assets)upsert(evidence.assets,await importer.asset(asset));
   const catalog=await importer.freshCatalog();current();evidence.completedAt=new Date().toISOString();delete evidence.lastError;evidence.totalProducts=catalog.length;evidence.withoutClassification=catalog.filter(product=>!product.category||!product.subcategoryId).map(product=>({id:product.id,name:product.name}));
   log({phase:'complete',products:evidence.products.length,assets:evidence.assets.length,total:catalog.length,withoutClassification:evidence.withoutClassification.length});$('#status').textContent='Lote concluído. Novos arquivos conferidos por leitura remota; cadastros existentes preservados.';
  }catch(error){evidence.lastError={at:new Date().toISOString(),message:error.message};$('#status').textContent='Operação interrompida: '+error.message;log({phase:'error',message:error.message});}
  finally{running=false;$('#refresh').disabled=sessionInvalid;$('#apply').disabled=sessionInvalid||!manifest||manifest.products.length+manifest.assets.length===0;$('#download').disabled=false;}
 }
 $('#refresh').onclick=()=>{if(!running)void refresh().catch(error=>{$('#status').textContent=error.message;log(error.message);});};$('#apply').onclick=apply;
 $('#download').onclick=()=>{const anchor=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));anchor.href=url;anchor.download='evidencia-catalogo-natal-20261031.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 try{
  if(supabaseConfig.url!==expectedUrl)throw Error('O frontend está configurado para outro projeto.');
  const response=await fetch('./manifest.json',{cache:'no-store'});if(!response.ok)throw Error('Manifesto revisado não encontrado.');manifest=validatePreparedManifest(await response.json());
  await restoreSession();actorId=api.getDataContext()?.user?.id;current();
  onAuthChange((event,session)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'&&session?.user?.id!==actorId){sessionInvalid=true;$('#apply').disabled=true;$('#refresh').disabled=true;$('#status').textContent='Sessão alterada. Recarregue esta página antes de continuar.';}});
  await refresh();$('#refresh').disabled=false;$('#apply').disabled=manifest.products.length+manifest.assets.length===0;
 }catch(error){$('#status').textContent=error.message;}
}
if(typeof document!=='undefined')void startReviewConsole();
