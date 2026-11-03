/** Reviewed admin-only importer. Credentials remain in process memory. No screenshot inputs. */
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';import {inflateSync} from 'node:zlib';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from '../shared/data/config.js';
const exec=promisify(execFile),projectRef='enhoierfwuwtzulznjxa',url=`https://${projectRef}.supabase.co`,bucket='product-photos';
const root=fileURLToPath(new URL('../',import.meta.url));const env={...process.env};delete env.SUPABASE_ACCESS_TOKEN;
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const sqlString=s=>"'"+String(s).replaceAll("'","''")+"'";const jsonSQL=value=>sqlString(JSON.stringify(value))+'::jsonb';
export function inspectTransparentPng(bytes){
 if(bytes.length>8*1024*1024||bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Use PNG válido de até 8 MB.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],type=bytes[25],interlace=bytes[28];
 if(width<1024||height<1024||width>12000||height>12000||width*height>40000000||depth!==8||interlace!==0)throw Error('O PNG deve ter ao menos 1024 px por lado, 8 bits, sem entrelaçamento, até 40 MP.');
 const channels=({0:1,2:3,3:1,4:2,6:4})[type];if(!channels)throw Error('Tipo de PNG não suportado.');
 const parts=[];let transparency;for(let at=8;at+12<=bytes.length;){const size=bytes.readUInt32BE(at),kind=bytes.toString('ascii',at+4,at+8);if(at+12+size>bytes.length)throw Error('PNG truncado.');if(kind==='IDAT')parts.push(bytes.subarray(at+8,at+8+size));if(kind==='tRNS')transparency=bytes.subarray(at+8,at+8+size);at+=size+12;}
 const stride=width*channels,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});if(raw.length!==(stride+1)*height)throw Error('Dados PNG inconsistentes.');
 let previous=Buffer.alloc(stride),transparent=0,visible=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const offset=y*(stride+1),filter=raw[offset],row=Buffer.from(raw.subarray(offset+1,offset+1+stride));if(filter>4)throw Error('Filtro PNG inválido.');for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;row[x]=(row[x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
  for(let x=0;x<width;x++){const index=x*channels;let alpha=255;if(type===6)alpha=row[index+3];else if(type===4)alpha=row[index+1];else if(type===3)alpha=transparency?.[row[index]]??255;else if(type===2&&transparency?.length===6&&row[index]===transparency.readUInt16BE(0)&&row[index+1]===transparency.readUInt16BE(2)&&row[index+2]===transparency.readUInt16BE(4))alpha=0;else if(type===0&&transparency?.length===2&&row[index]===transparency.readUInt16BE(0))alpha=0;if(alpha===0)transparent++;if(alpha>0)visible++;}previous=row;
 }
 if(transparent<width*height*.01||!visible)throw Error('O PNG precisa de transparência real em pelo menos 1% dos pixels e produto visível.');return {width,height,transparentPixels:transparent,transparentFraction:transparent/(width*height)};
}
async function cli(args){try{const result=await exec('supabase',args,{cwd:root,env,maxBuffer:32*1024*1024});return JSON.parse(result.stdout.trim());}catch{throw Error('A operação administrativa Supabase falhou; nenhuma credencial foi registrada.');}}
async function readAuthCredentials(){
 if(!process.stdin.isTTY)return JSON.parse(await readFile('/dev/stdin','utf8'));
 console.log('Credenciais Auth JSON na entrada oculta:');process.stdin.setRawMode(true);process.stdin.resume();let value='';
 try{return await new Promise((resolve,reject)=>{const receive=chunk=>{const text=chunk.toString('utf8');if(text.includes('\u0003')){process.stdin.off('data',receive);reject(Error('Importação cancelada.'));return;}value+=text;if(value.includes('\n')){process.stdin.off('data',receive);try{resolve(JSON.parse(value.trim()));}catch{reject(Error('Credenciais Auth inválidas.'));}}};process.stdin.on('data',receive);});}
 finally{process.stdin.setRawMode(false);process.stdin.pause();}
}

async function main(){
 const manifestFile=arg('--manifest');if(!manifestFile)throw Error('Informe --manifest /caminho/import.json; --apply executa o plano.');
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));if(manifest.projectRef!==projectRef||!manifest.companyId||!Array.isArray(manifest.products)||!manifest.products.length)throw Error('Manifesto sem projeto, empresa ou produtos válidos.');
 if((await readFile(path.join(root,'supabase/.temp/project-ref'),'utf8')).trim()!==projectRef)throw Error('O checkout está vinculado a outro projeto.');
 const seen=new Set(),products=[];
 for(const input of manifest.products){
  if(typeof input.code!=='string'||!input.code.trim()||input.code.length>40||seen.has(input.code.toLowerCase()))throw Error('Cada SKU precisa de código interno único de até 40 caracteres.');seen.add(input.code.toLowerCase());
  if(!input.name||input.name.length>100||!input.category||!input.unit||!Array.isArray(input.photos)||input.photos.length!==3)throw Error(`Dados incompletos: ${input.code}`);
  if(Object.keys(input).some(key=>/price|preco|preço|promotion/i.test(key)))throw Error('Preços promocionais não pertencem ao cadastro permanente.');
  const angles=new Set(),hashes=new Set(),photos=[];
  for(const photo of input.photos){if(photo.source!=='generated'||!['front','left','right'].includes(photo.angle)||angles.has(photo.angle)||!path.isAbsolute(photo.file)||/captura|screenshot|screen.?shot/i.test(photo.file))throw Error('Exija três packshots novos, identificados como front/left/right; capturas de tela não são aceitas.');angles.add(photo.angle);
   const bytes=await readFile(photo.file),dimensions=inspectTransparentPng(bytes),sha256=createHash('sha256').update(bytes).digest('hex');if(hashes.has(sha256))throw Error('Os três ângulos precisam ser arquivos distintos.');hashes.add(sha256);photos.push({...photo,...dimensions,sha256,size:bytes.length});}
  products.push({...input,photos});
 }
 console.log(JSON.stringify({phase:'validated',projectRef,products:products.length,photos:products.length*3,totalBytes:products.flatMap(p=>p.photos).reduce((s,p)=>s+p.size,0),transparentPng:true}));
 if(!process.argv.includes('--apply'))return;
 const scratch=await mkdtemp(path.join(tmpdir(),'supermercado-product-import-'));
 const query=async sql=>{const file=path.join(scratch,randomUUID()+'.sql');await writeFile(file,sql,{mode:0o600});try{return await cli(['db','query','--linked','--file',file,'--agent','no','--output','json']);}finally{await rm(file,{force:true});}};
 let client;
 try{
  // Read only bucket configuration through the authenticated management CLI.
  // No API-key discovery or secret administrative credentials are used.
  const buckets=await query("select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='product-photos';");
  if(buckets.length!==1||buckets[0].public||Number(buckets[0].file_size_limit)!==8388608||!['image/png','image/jpeg','image/webp'].every(mime=>(buckets[0].allowed_mime_types??[]).includes(mime)))throw Error('O bucket product-photos precisa ser criado como privado, limite 8 MB, antes da importação.');
  const credentials=await readAuthCredentials();
  client=createClient(url,supabaseConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {error:loginError}=await client.auth.signInWithPassword(credentials);if(loginError)throw Error('Não foi possível autenticar a conta autorizada.');
  const rpc=async(name,params)=>{const {data,error}=await client.rpc(name,params);if(error)throw Error(error.message);return data;};
  const context=await rpc('sp_context',{}),company=manifest.companyId;
  const membership=context.companies.find(c=>c.id===company);if(!membership||!['owner','admin'].includes(membership.role))throw Error('A importação exige a conta administradora desta empresa.');
  const catalog=await rpc('sp_list',{p_company_id:company,p_resource:'products'}),byCode=new Map(catalog.filter(p=>p.code).map(p=>[p.code.toLowerCase(),p]));
  const results=[];
  for(const input of products){
   let record=byCode.get(input.code.toLowerCase());
   if(!record){const fields=Object.fromEntries(['name','code','category','brand','manufacturer','description','sourceUrl','packSize'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));record=await rpc('sp_save',{p_company_id:company,p_resource:'products',p_record:{...fields,id:input.id??randomUUID(),unit:input.unit,photos:[]},p_expected_version:null});byCode.set(input.code.toLowerCase(),record);}
   const id=record.id,refs=[];const before=await rpc('sp_get',{p_company_id:company,p_resource:'products',p_id:id});const newCount=input.photos.filter(p=>!(before.photoAssets??[]).some(a=>a.path===`${company}/products/${id}/${p.sha256}.png`)).length;if((before.photos??[]).length+(before.photoAssets??[]).length+newCount>5)throw Error('Galeria sem espaço: nenhum arquivo novo foi enviado.');
   for(const photo of input.photos){const objectPath=`${company}/products/${id}/${photo.sha256}.png`,store=client.storage.from(bucket),existing=await store.info(objectPath);
    if(existing.error){const uploaded=await store.upload(objectPath,await readFile(photo.file),{contentType:'image/png',upsert:false,cacheControl:'3600'});if(uploaded.error)throw Error(`Upload falhou para ${input.code}/${photo.angle}: ${uploaded.error.message}`);}
    const checked=await store.download(objectPath);if(checked.error)throw Error('Não foi possível conferir o arquivo armazenado.');const remote=Buffer.from(await checked.data.arrayBuffer());if(createHash('sha256').update(remote).digest('hex')!==photo.sha256)throw Error('O arquivo armazenado difere do packshot aprovado.');
    refs.push({bucket,path:objectPath,mimeType:'image/png',size:photo.size,width:photo.width,height:photo.height,angle:photo.angle,source:'generated'});
   }
   const current=await rpc('sp_get',{p_company_id:company,p_resource:'products',p_id:id});if(current.code.toLowerCase()!==input.code.toLowerCase())throw Error('O código do produto mudou durante a importação.');
   const assets=[...(current.photoAssets??[])],legacy=current.photos??[];let total=assets.length+legacy.length,changed=false;
   for(const asset of refs)if(!assets.some(a=>a.path===asset.path)){if(total>=5)throw Error('Galeria sem espaço: os dados atuais foram preservados.');assets.push({...asset,position:total++});changed=true;}
   const saved=changed?await rpc('sp_product_gallery',{p_company_id:company,p_product_id:id,p_assets:assets,p_legacy_photos:legacy,p_expected_version:current._version}):current;
   const result={code:input.code,id,photos:saved.photoAssets.length};results.push(result);console.log(JSON.stringify({phase:'imported',...result}));
  }
  console.log(JSON.stringify({phase:'complete',products:results.length,photos:products.length*3,bucket,private:true}));
 }finally{if(client){await client.auth.signOut({scope:'local'});await client.removeAllChannels();client.realtime.disconnect();}await rm(scratch,{recursive:true,force:true});}

}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
