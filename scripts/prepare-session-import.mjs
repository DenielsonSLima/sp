/** Local review console. Reuses browser Auth; prepared files remain in ignored dist/. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectTransparentPng} from './import-product-storage.mjs';

export const projectRef='enhoierfwuwtzulznjxa',companyId='89d1d8c9-b03d-46aa-a743-deac900f93b3';
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error(label+' inválido.');return value.trim();};
const identifier=(value,label)=>{if(typeof value!=='string'||!/^[-\w]{1,100}$/.test(value))throw Error(label+' inválido.');return value;};
export function validateSourceManifest(input){
 if(!input||input.projectRef!==projectRef||input.companyId!==companyId)throw Error('Manifesto fora do projeto/empresa autorizados.');
 if(input.products!==undefined&&!Array.isArray(input.products)||input.assets!==undefined&&!Array.isArray(input.assets))throw Error('Listas de produtos ou elementos inválidas.');
 const products=(input.products??[]).map(product=>{
  if(!product||Object.keys(product).some(key=>/price|preco|preço|promotion/i.test(key)))throw Error('Preços não pertencem ao lote de cadastros.');
  const fields={name:text(product.name,'Nome do produto',100),code:text(product.code,'Código',40),category:text(product.category,'Categoria',80),subcategory:text(product.subcategory,'Subcategoria revisada',80),unit:identifier(product.unit,'Unidade')};
  for(const key of ['brand','manufacturer','description','sourceUrl','packSize'])if(product[key]!==undefined)fields[key]=text(product[key],key,key==='description'?4000:key==='sourceUrl'?2000:200);
  if(fields.sourceUrl&&!/^https:\/\//.test(fields.sourceUrl))throw Error('Use fonte pública HTTPS.');
  if(!Array.isArray(product.photos)||product.photos.length!==3||new Set(product.photos.map(photo=>photo?.angle)).size!==3||product.photos.some(photo=>!photo||!['front','left','right'].includes(photo.angle)||photo.source!=='generated'||typeof photo.file!=='string'||!photo.file.trim()))throw Error('Exija três fotos front/left/right geradas.');
  const id='reviewed-product-'+hash(companyId+'|'+fold(fields.code)).slice(0,24);
  return {...fields,id,photos:product.photos.map(photo=>({file:photo.file,angle:photo.angle,source:'generated'}))};
 });
 const assets=(input.assets??[]).map(asset=>{
  if(!asset)throw Error('Elemento da biblioteca inválido.');
  const name=text(asset.name,'Nome do elemento',100),category=text(asset.category,'Categoria do elemento',80);
  if(typeof asset.file!=='string'||!asset.file.trim())throw Error('Arquivo do elemento inválido.');
  return {id:asset.id===undefined?'reviewed-asset-'+hash(companyId+'|'+fold(category)+'|'+fold(name)).slice(0,24):identifier(asset.id,'ID do elemento'),name,category,file:asset.file};
 });
 return {projectRef,companyId,products,assets};
}
export function validateImportUniqueness({products,assets}){
 for(const [rows,key,label] of [[products,row=>fold(row.code),'Código de produto'],[products,row=>fold(row.name),'Nome de produto'],[assets,row=>row.id,'ID de elemento'],[assets,row=>fold(row.category)+'|'+fold(row.name),'Elemento por pasta']]){
  const seen=new Set();for(const row of rows){const value=key(row);if(seen.has(value))throw Error(label+' repetido entre manifestos.');seen.add(value);}
 }
}
export async function prepareSessionImport(inputPaths,{destination=path.resolve('dist/_reviewed-import')}={}){
 const products=[],assets=[];
 // Validate every manifest before publishing a different review plan.
 const inputs=[];for(const file of inputPaths)inputs.push(validateSourceManifest(JSON.parse(await readFile(file,'utf8'))));
 const combined={products:inputs.flatMap(input=>input.products),assets:inputs.flatMap(input=>input.assets)};validateImportUniqueness(combined);
 await mkdir(path.join(destination,'files'),{recursive:true});
 async function photoFile(file,{product=false}={}){
  if(/captura|screenshot|screen.?shot/i.test(path.basename(file)))throw Error('Capturas não podem ser importadas como fotos.');
  const bytes=await readFile(file);
  if(bytes.length<33||bytes.length>8*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(8)!==13)throw Error('Exija PNG válido de até 8 MB.');
  const dimensions=product?inspectTransparentPng(bytes):{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(!product&&(!dimensions.width||!dimensions.height||dimensions.width>10000||dimensions.height>10000||dimensions.width*dimensions.height>20000000))throw Error('Elemento da biblioteca excede as dimensões permitidas.');
  const sha256=hash(bytes);await copyFile(file,path.join(destination,'files',sha256+'.png'));
  return {url:'./files/'+sha256+'.png',sha256,size:bytes.length,width:dimensions.width,height:dimensions.height};
 }
 for(const input of combined.products){
  const photos=[];for(const photo of input.photos)photos.push({...await photoFile(photo.file,{product:true}),angle:photo.angle,source:'generated'});
  if(new Set(photos.map(photo=>photo.sha256)).size!==3)throw Error('Cada ângulo precisa ter pixels distintos.');
  products.push({...input,photos});
 }
 for(const {file,...asset} of combined.assets)assets.push({...asset,...await photoFile(file)});
 const prepared={projectRef,companyId,products,assets};
 await writeFile(path.join(destination,'manifest.json'),JSON.stringify(prepared,null,2));
 await writeFile(path.join(destination,'index.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Importação revisada · Supermercado do Povo</title><link rel="stylesheet" href="../shared/base.css"><script type="importmap">{"imports":{"@supabase/supabase-js":"../vendor/supabase.js","@tanstack/query-core":"../vendor/query-core.js"}}</script><style>body{max-width:1000px;margin:40px auto;padding:24px}button{margin:12px 12px 12px 0;padding:14px}pre{white-space:pre-wrap;font:12px monospace;background:white;padding:22px;border:1px solid #ddd;line-height:1.6}h1{font-size:26px}#plan{line-height:1.8}a{color:#ad2034}</style><h1>Importação revisada do catálogo e Biblioteca</h1><p>Projeto enhoierfwuwtzulznjxa · empresa Supermercado do Povo. Usa somente a sessão Auth deste navegador e as RPCs do sistema.</p><p id="status" role="status">Conferindo sessão…</p><button id="refresh" disabled>Conferir catálogo atual</button><button id="apply" disabled>Aplicar lote revisado</button><button id="download" disabled>Baixar evidência JSON</button><a href="../#cadastros/produtos">Voltar ao sistema</a><div id="plan"></div><pre id="log"></pre><script type="module" src="./runner.js"></script></html>`);
 await copyFile(fileURLToPath(new URL('./session-import-runner.js',import.meta.url)),path.join(destination,'runner.js'));
 return {prepared:true,products:products.length,photos:products.length*3,assets:assets.length,url:'http://127.0.0.1:4173/_reviewed-import/'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareSessionImport(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
