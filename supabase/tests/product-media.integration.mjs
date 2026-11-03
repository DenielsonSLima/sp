import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rpc=async(name,args=[])=>{const result=await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args);return result.rows[0].result;};
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`);
 await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'owner@example.com',other,'other@example.com']);
 const company=(await db.query("select sp_private.bootstrap_company('owner@example.com','Loja A') as id")).rows[0].id;
 const otherCompany=(await db.query("select sp_private.bootstrap_company('other@example.com','Loja B') as id")).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 const photo='data:image/png;base64,'+'AAAA'.repeat(150000);
 const saved=await rpc('sp_save',[company,'products',{id:'media-product',name:'Com fotos',category:'Hortifruti',unit:'KG',photos:[photo]},null]);
 await rpc('sp_save',[company,'products',{id:'empty-product',name:'Sem fotos',category:'Hortifruti',unit:'KG',photos:[]},null]);
 await db.exec('reset role');
 await db.exec(readFileSync(new URL('../catalog-schema.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/20261031031813_optimize_product_media_rpc.sql',import.meta.url),'utf8'));
 await db.exec('set role authenticated');
 const rows=await rpc('sp_list',[company,'products']);assert.equal(rows.length,2);assert.ok(JSON.stringify(rows).length<1500);
 for(const row of rows){assert.ok(!('photos'in row));assert.ok(!('photo'in row));assert.ok(!('image'in row));}
 assert.equal(rows.find(r=>r.id==='media-product').hasPhotos,true);assert.equal(rows.find(r=>r.id==='empty-product').hasPhotos,false);
 const media=await rpc('sp_product_media',[company,['media-product','empty-product']]);assert.equal(media.length,2);assert.deepEqual(Object.keys(media[0]).sort(),['_version','id','photos']);assert.deepEqual(media[0].photos,[photo]);assert.equal(media[0]._version,saved._version);assert.deepEqual(media[1].photos,[]);
 const detail=await rpc('sp_get',[company,'products','media-product']);assert.deepEqual(detail.photos,[photo]);assert.ok(!('photo'in detail));assert.ok(!('image'in detail));
 await rpc('sp_save',[company,'product_categories',{id:'horti-category',name:'Hortifruti'},null]);const updated=await rpc('sp_save',[company,'products',{...detail,name:'Atualizado',photos:[]},detail._version]);assert.equal(updated._version,2);assert.equal((await rpc('sp_list',[company,'products'])).find(r=>r.id==='media-product').hasPhotos,false);
 await assert.rejects(()=>rpc('sp_save',[company,'products',{...updated,photos:Array(6).fill(photo)},updated._version]),/Galeria/);
 await assert.rejects(()=>rpc('sp_product_media',[company,Array(9).fill('media-product')]),/até 8/);
 await assert.rejects(()=>rpc('sp_product_media',[company,[null]]),/Identificador/);
 await assert.rejects(()=>rpc('sp_product_media',[company,['__proto__']]),/Identificador/);
 assert.deepEqual(await rpc('sp_product_media',[company,[]]),[]);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 await assert.rejects(()=>rpc('sp_product_media',[company,['media-product']]),/não autorizado/);
 assert.deepEqual(await rpc('sp_product_media',[otherCompany,['media-product']]),[]);
 await db.exec('reset role');await db.exec('set role anon');await assert.rejects(()=>rpc('sp_product_media',[company,['media-product']]),/permission denied/);
 await db.exec('reset role');const count=(await db.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" )).rows[0].n;assert.equal(count,27);
 console.log('PASS: product metadata excludes binaries, media only requested tenant IDs, single photo copy, 8-ID limit, authentication, generated projection updates, table count preserved.');
}catch(error){console.error(error.message,error.where||'',error.code||'');process.exitCode=1;}finally{await db.close();}
