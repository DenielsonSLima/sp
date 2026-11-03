import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataApi,PRODUCT_MEDIA_CACHE_MS,PRODUCT_SIGNED_URL_SECONDS} from '../shared/data/api.js';
import {createRemoteProductRepository} from '../interno/cadastros/produtos/state.js';
import {isSignedProductPhoto,isPhotoSource,canonicalGallery,refreshGallerySources} from '../interno/cadastros/produtos/photo.js';
const origin='https://enhoierfwuwtzulznjxa.supabase.co';
const signed=(path,token='token')=>`${origin}/storage/v1/object/sign/product-photos/${path}?token=${token}`;
const asset=(id,position=0,company='a')=>({bucket:'product-photos',path:`${company}/products/${id}/photo-${position}.png`,mimeType:'image/png',size:128,width:1024,height:1024,position});
const context=companyId=>({companyId,user:{id:'user'},companies:[{id:companyId,name:'Empresa',role:'admin'}]});
function fixture({handler,clock=()=>Date.now(),signer}={}){
 const calls=[],signs=[],uploads=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return handler(name,args);},channel(){return {on(){return this;},subscribe(){return this;}};},async removeChannel(){},storage:{from(bucket){assert.equal(bucket,'product-photos');return {async createSignedUrls(paths,ttl){signs.push({paths,ttl});return signer?signer(paths,ttl):{data:paths.map(path=>({path,signedUrl:signed(path,`signature-${signs.length}`),error:null})),error:null};},async upload(path,blob,options){uploads.push({path,blob,options});return {data:{path},error:null};}};}}};
 return {api:createDataApi({client,now:clock}),calls,signs,uploads};
}

test('only signed URLs from the authorized private product bucket can render',()=>{
 const url=signed(asset('p').path);assert.equal(isSignedProductPhoto(url),true);assert.equal(isPhotoSource(url),true);
 for(const bad of [url.replace(origin,'https://evil.example'),url.replace('product-photos','other-bucket'),url.replace('https:','http:'),url.replace('?token=token',''),url.replace('?token=token','?token='),`${origin}/storage/v1/object/public/product-photos/a/photo.png`])assert.equal(isPhotoSource(bad),false,bad);
 assert.equal(isSignedProductPhoto(url,{path:asset('other').path}),false);
});

test('Storage URLs are signed in batches, kept shorter than validity, and refreshed on expiry while unchanged versions survive invalidation',async()=>{
 let clock=1000;
 const rows=[{id:'p',_version:1,hasPhotos:true},{id:'q',_version:1,hasPhotos:true}];
 const f=fixture({clock:()=>clock,handler:async(name,args)=>name==='sp_list'?{data:rows,error:null}:{data:args.p_ids.map(id=>({id,_version:1,photos:[],photoAssets:[asset(id,0),asset(id,1)]})),error:null}});
 await f.api.setContext(context('a'));
 const first=await f.api.listRecords('products');assert.equal(f.signs.length,1);assert.equal(f.signs[0].paths.length,4);assert.equal(f.signs[0].ttl,PRODUCT_SIGNED_URL_SECONDS);assert.ok(PRODUCT_MEDIA_CACHE_MS<PRODUCT_SIGNED_URL_SECONDS*1000);
 assert.equal(first[0].photos.length,2);assert.equal(first[0].legacyPhotos.length,0);assert.equal(first[0].photoAssets[0].path,asset('p').path);
 await f.api.listRecords('products',{force:true});assert.equal(f.signs.length,1);
 clock+=PRODUCT_MEDIA_CACHE_MS+1;const renewed=await f.api.listRecords('products',{force:true});assert.equal(f.signs.length,2);assert.notEqual(renewed[0].photo,first[0].photo);
 await f.api.invalidate('products');await f.api.listRecords('products');assert.equal(f.signs.length,2,'unchanged versions retain their unexpired signed URLs');
 await f.api.setContext(null);
});

test('single-product reads sign Storage and preserve mixed gallery slot ordering',async()=>{
 const legacy='data:image/png;base64,AAAA',ref=asset('p',1);
 const f=fixture({handler:async()=>({data:{id:'p',_version:4,photos:[legacy],photoAssets:[ref]},error:null})});await f.api.setContext(context('a'));
 const row=await f.api.getRecord('products','p');assert.deepEqual(row.photos,[legacy,signed(ref.path,'signature-1')]);assert.equal(row.photo,legacy);assert.equal(row.photoEntries[1].asset.path,ref.path);
 await f.api.setContext(null);
});

test('media signing rejects foreign paths and bad signer URLs instead of accepting arbitrary images',async()=>{
 const f=fixture({handler:async()=>({data:{id:'p',_version:1,photos:[],photoAssets:[asset('p',0,'foreign-company')]},error:null})});await f.api.setContext(context('a'));
 await assert.rejects(f.api.getRecord('products','p'),/produto autorizado/);assert.equal(f.signs.length,0);await f.api.setContext(null);
 const g=fixture({handler:async()=>({data:{id:'p',_version:1,photos:[],photoAssets:[asset('p')]},error:null}),signer:async paths=>({data:paths.map(path=>({path,signedUrl:'https://evil.example/photo.png'})),error:null})});await g.api.setContext(context('a'));
 await assert.rejects(g.api.getRecord('products','p'),/autorizar todas/);await g.api.setContext(null);
});

test('product metadata never sends temporary URLs or view-only gallery fields to the database',async()=>{
 const ref=asset('p'),url=signed(ref.path),legacy='data:image/png;base64,AAAA';
 const f=fixture({handler:async(name,args)=>({data:{...args.p_record,id:'p',_version:2},error:null})});await f.api.setContext(context('a'));
 await f.api.saveRecord('products',{id:'p',name:'Produto',_version:1,photos:[url,legacy],legacyPhotos:[legacy],photoAssets:[ref],photoEntries:[{src:url,asset:ref}],photo:url,image:url});
 const written=f.calls.find(call=>call.name==='sp_save').args.p_record;assert.deepEqual(written.photos,[legacy]);assert.equal(written.photoEntries,undefined);assert.equal(written.photo,undefined);assert.equal(JSON.stringify(written).includes('token='),false);
 await assert.rejects(f.api.saveRecord('products',{id:'p',photos:[url]}),/galeria legada/);await f.api.setContext(null);
});

test('manual additions upload a new immutable object then save canonical asset references with the viewed version',async()=>{
 const oldRef=asset('p'),oldURL=signed(oldRef.path),newPhoto='data:image/png;base64,AQID';const writes=[],galleryWrites=[],uploads=[];
 const current={id:'p',name:'Produto',_version:5,photos:[oldURL],legacyPhotos:[],photoAssets:[oldRef],photoEntries:[{src:oldURL,asset:oldRef}]};
 const repository=createRemoteProductRepository({hydrateUnits:async()=>{},readOne:async()=>current,write:async(resource,input,options)=>{writes.push({input,options});return {...current,...input,_version:6};},upload:async(id,source)=>{uploads.push({id,source});return {...asset(id),path:`a/products/${id}/new.png`};},writeGallery:async(id,gallery,options)=>{galleryWrites.push({id,gallery,options});return {...current,_version:7,photos:[oldURL,signed(`a/products/${id}/new.png`)]};}});
 const saved=await repository.updateProduct('p',{name:'Atualizado',_version:5,photos:[oldURL,newPhoto],photoEntries:current.photoEntries});
 assert.equal(uploads.length,1);assert.equal(uploads[0].source,newPhoto);assert.equal(writes[0].input.photos,undefined);assert.equal(writes[0].options.expectedVersion,5);assert.equal(galleryWrites[0].options.expectedVersion,6);assert.deepEqual(galleryWrites[0].gallery.legacyPhotos,[]);assert.equal(galleryWrites[0].gallery.photoAssets[1].position,1);assert.equal(JSON.stringify(galleryWrites[0]).includes('token='),false);assert.equal(saved._version,7);
});

test('reordering existing Storage photos never uploads again or serializes the signed URL',async()=>{
 const refs=[asset('p',0),asset('p',1)],urls=refs.map(ref=>signed(ref.path)),current={id:'p',_version:1,photos:urls,legacyPhotos:[],photoAssets:refs,photoEntries:refs.map((ref,index)=>({src:urls[index],asset:ref}))};let gallery;
 const repository=createRemoteProductRepository({hydrateUnits:async()=>{},readOne:async()=>current,write:async()=>({...current,_version:2}),upload:async()=>{throw Error('must not upload existing photos');},writeGallery:async(id,input)=>{gallery=input;return {...current,_version:3};}});
 await repository.updateProductPhotos('p',[urls[1],urls[0]]);assert.equal(gallery.photoAssets[0].path,refs[1].path);assert.equal(gallery.photoAssets[0].position,0);assert.equal(JSON.stringify(gallery).includes('token='),false);
 assert.deepEqual(canonicalGallery([urls[1],urls[0]],current.photoEntries).photoAssets.map(ref=>ref.position),[0,1]);
});

test('URL renewal keeps draft ordering and legacy data without changing canonical paths',()=>{
 const ref=asset('p'),before=signed(ref.path,'old'),after=signed(ref.path,'new'),legacy='data:image/png;base64,AAAA';
 const refreshed=refreshGallerySources([legacy,before],[{src:before,asset:ref}],[{src:after,asset:ref}]);assert.deepEqual(refreshed.photos,[legacy,after]);assert.equal(refreshed.photoEntries[0].asset.path,ref.path);
});

test('gallery failure reports saved metadata and retains uploaded references for an explicit retry',async()=>{
 const source='data:image/png;base64,AQID',newRef=asset('new');let uploads=0;
 const repository=createRemoteProductRepository({write:async()=>({id:'new',_version:1,photos:[],legacyPhotos:[],photoEntries:[]}),upload:async()=>{uploads++;return newRef;},writeGallery:async()=>{throw Error('Galeria indisponível.');}});
 await assert.rejects(repository.createProduct({name:'Novo',photos:[source]}),error=>{assert.equal(error.savedProduct.id,'new');assert.equal(error.pendingPhotoEntries[0].asset.path,newRef.path);assert.match(error.message,/dados do produto foram salvos/);return true;});assert.equal(uploads,1);
});

test('document snapshots materialize only authorized product pixels, preserving PNG bytes and alpha',async()=>{
 const {materializeProductPhoto}=await import('../interno/cadastros/produtos/photo.js');
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const source=signed(asset('p').path);let calls=0;
 const copied=await materializeProductPhoto(source,{fetcher:async(url,options)=>{calls++;assert.equal(url,source);assert.equal(options.redirect,'error');return new Response(Uint8Array.from(atob(png),character=>character.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});}});
 assert.equal(copied,`data:image/png;base64,${png}`);assert.equal(calls,1);
 await assert.rejects(materializeProductPhoto('https://external.example/photo.png',{fetcher:async()=>{throw Error('must not fetch');}}),/armazenamento autorizado/);
});

test('manual upload uses a new product-scoped object and gallery RPC receives references plus explicit version',async()=>{
 const ref=asset('p');const f=fixture({handler:async(name,args)=>{assert.equal(name,'sp_product_gallery');return {data:{id:'p',_version:3,photos:args.p_legacy_photos,photoAssets:args.p_assets},error:null};}});await f.api.setContext(context('a'));
 const uploaded=await f.api.uploadProductPhoto('p','data:image/png;base64,AQID');assert.match(uploaded.path,/^a\/products\/p\/[a-f0-9-]+\.png$/);assert.equal(f.uploads[0].options.upsert,false);assert.equal(f.uploads[0].blob.size,3);assert.equal(uploaded.mimeType,'image/png');
 const saved=await f.api.saveProductGallery('p',{photoAssets:[ref],legacyPhotos:[]},{expectedVersion:2});
 assert.deepEqual(f.calls[0].args,{p_company_id:'a',p_product_id:'p',p_assets:[ref],p_legacy_photos:[],p_expected_version:2});assert.equal(saved.photo,signed(ref.path,'signature-1'));await f.api.setContext(null);
});

test('logout while signing cannot repopulate the previous company media cache',async()=>{
 let release,started;const signingStarted=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);
 const f=fixture({handler:async()=>({data:{id:'p',_version:1,photos:[],photoAssets:[asset('p')]},error:null}),signer:async paths=>{started();await pending;return {data:paths.map(path=>({path,signedUrl:signed(path)})),error:null};}});
 await f.api.setContext(context('a'));const reading=f.api.getRecord('products','p');await signingStarted;await f.api.setContext(null);release();
 await assert.rejects(reading,/sessão mudou|CancelledError/);assert.equal(f.api.queryClient.getQueryData(['sp','a','product_media','p',1]),undefined);
});

test('historical operational snapshots sign their stable primary reference without querying the current product',async()=>{
 const ref=asset('deleted-product'),document={id:'receipt',_version:7,items:[{id:'line',productId:'deleted-product',name:'Foto histórica',photo:'',photoAssets:[ref]}]};
 const f=fixture({handler:async(name)=>{assert.equal(name,'sp_list');return {data:[document],error:null};}});await f.api.setContext(context('a'));
 const rows=await f.api.listRecords('hortifruti_receipts');assert.equal(rows[0].items[0].photo,signed(ref.path,'signature-1'));assert.equal(rows[0].items[0].photoAssets[0].path,ref.path);assert.equal(f.calls.length,1);await f.api.setContext(null);
});

test('snapshot command writes omit temporary URLs while returned snapshots receive fresh readable media',async()=>{
 const ref=asset('p'),url=signed(ref.path),item={productId:'p',photo:url,image:url,photos:[url],legacyPhotos:[],photoAssets:[ref],photoEntries:[{src:url,asset:ref}]};
 const f=fixture({handler:async(name,args)=>{assert.equal(name,'sp_command');assert.equal(args.p_payload.items[0].photo,'');assert.deepEqual(args.p_payload.items[0].photos,[]);assert.equal(args.p_payload.items[0].photoEntries,undefined);assert.equal(JSON.stringify(args.p_payload).includes('token='),false);return {data:{id:'quote',_version:2,items:[{productId:'p',photo:'',photoAssets:[ref]}]},error:null};}});await f.api.setContext(context('a'));
 const result=await f.api.command('quotes','update','quote',{items:[item],_version:1});assert.equal(result.items[0].photo,signed(ref.path,'signature-1'));await f.api.setContext(null);
});
