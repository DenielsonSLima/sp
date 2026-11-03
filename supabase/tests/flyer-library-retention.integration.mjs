import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rpc=async(name,args=[])=>{const result=await db.query(`select public.${name}(${args.map((_,index)=>'$'+(index+1)).join(',')}) result`,args);return result.rows[0].result;};
const migration=readFileSync(new URL('../migrations/20261102005446_flyer_library_draft_retention.sql',import.meta.url),'utf8');
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`);
 await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 // PGlite cannot load the pg_cron worker. Stub scheduling only; execute the real
 // migration functions, grants, index, projection and deletion trigger unchanged.
 await db.exec(`create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text);create function cron.schedule(job_name text,job_schedule text,job_command text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(job_name,job_schedule,job_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;`);
 assert(migration.includes('create extension if not exists pg_cron with schema pg_catalog;'));
 await db.exec(migration.replace('create extension if not exists pg_cron with schema pg_catalog;',''));
 const job=(await db.query('select jobname,schedule,command from cron.job')).rows;
 assert.deepEqual(job,[{jobname:'sp-expire-flyer-drafts',schedule:'*/15 * * * *',command:'select sp_private.expire_flyer_drafts();'}]);
 await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'flyers-owner@example.com',other,'flyers-other@example.com']);
 const company=(await db.query("select sp_private.bootstrap_company('flyers-owner@example.com','Loja A') id")).rows[0].id;
 const foreign=(await db.query("select sp_private.bootstrap_company('flyers-other@example.com','Loja B') id")).rows[0].id;
 const source='data:image/webp;base64,'+'A'.repeat(1024*1024);
 const design={id:'art',title:'Arte de Natal',status:'draft',width:1080,height:1920,bgColor:'#fff',createdAt:'2000-01-01T00:00:00Z',updatedAt:'2000-01-01T00:00:00Z',elements:[{id:'background',type:'image',src:source,x:0,y:0,width:1080,height:1920,locked:true}]};
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 let saved=await rpc('sp_save',[company,'flyers',design,null]);
 let library=await rpc('sp_flyer_library',[company]);
 assert.equal(library.length,1);assert(JSON.stringify(library).length<600,'metadata excludes the 1 MB snapshot');
 assert.deepEqual(Object.keys(library[0]).sort(),['_version','createdAt','expiresAt','height','id','status','title','updatedAt','width'].sort());
 assert(!JSON.stringify(library).includes('base64'));assert.equal(library[0]._version,1);assert.equal(library[0].title,design.title);
 assert(new Date(library[0].createdAt).getFullYear()>2000,'timestamps use server columns, not the client document');
 assert.equal(new Date(library[0].expiresAt)-new Date(library[0].updatedAt),15*86400000);
 const detail=await rpc('sp_get',[company,'flyers','art']);assert.equal(detail.elements[0].src,source,'individual detail retains exact snapshot');
 console.log('LOCAL SYNTHETIC PAYLOAD:',JSON.stringify({fixtureBase64Characters:1024*1024,libraryJsonBytes:Buffer.byteLength(JSON.stringify(library)),documentJsonBytes:Buffer.byteLength(JSON.stringify(detail))}));
 saved=await rpc('sp_save',[company,'flyers',{...saved,title:'Arte atualizada'},saved._version]);
 library=await rpc('sp_flyer_library',[company]);assert.equal(library[0].title,'Arte atualizada');assert.equal(library[0]._version,2);
 await assert.rejects(()=>rpc('sp_save',[company,'flyers',{...saved,title:'Conflito'},1]),/alterado/);
 await assert.rejects(()=>rpc('sp_flyer_library',[foreign]),/não autorizado/);
 await assert.rejects(()=>db.query('select sp_private.expire_flyer_drafts()'),/permission denied/);
 await assert.rejects(()=>db.query("delete from public.flyers where company_id=$1",[company]),/permission denied/);
 await db.exec('reset role');
 const put=async(id,status,updated,tenant=company)=>db.query(`insert into public.flyers(company_id,id,data,created_at,updated_at) values($1,$2,$3,now()-interval '40 days',now()+$4::interval)`,[tenant,id,{...design,id,status,createdAt:'1900-01-01T00:00:00Z',updatedAt:'2999-01-01T00:00:00Z'},updated]);
 await put('expired','draft','-16 days');await put('expired-foreign','draft','-16 days',foreign);
 await put('fresh','draft','-14 days');await put('created-old','created','-30 days');await put('unknown-old','review','-30 days');
 await put('renewed','draft','-30 days');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 await rpc('sp_save',[company,'flyers',{...design,id:'renewed',title:'Editado hoje'},1]);
 await db.exec('reset role');
 const revision=async tenant=>(await db.query("select revision from public.resource_changes where company_id=$1 and resource='flyers'",[tenant])).rows[0].revision;
 const beforeA=await revision(company),beforeB=await revision(foreign);
 assert.equal((await db.query('select sp_private.expire_flyer_drafts() n')).rows[0].n,2);
 assert(await revision(company)>beforeA);assert(await revision(foreign)>beforeB);
 const remaining=(await db.query('select id from public.flyers order by id')).rows.map(row=>row.id);
 assert.deepEqual(remaining,['art','created-old','fresh','renewed','unknown-old']);
 const audits=(await db.query("select record_id,actor_id,version from public.audit_log where action='expire_draft' order by record_id")).rows;
 assert.deepEqual(audits.map(row=>row.record_id),['expired','expired-foreign']);assert(audits.every(row=>row.actor_id===null&&row.version===1));
 assert.equal((await db.query('select sp_private.expire_flyer_drafts() n')).rows[0].n,0,'repeat is idempotent');
 await db.exec('set role authenticated');await assert.rejects(()=>rpc('sp_save',[company,'flyers',{...design,id:'expired'},1]),/removido/);await db.exec('reset role');
 // now() stays fixed inside this transaction: exact 15 days expires, one second
 // younger does not, regardless of any client-supplied timestamps.
 await db.exec('begin');await put('boundary','draft','-15 days');await put('almost','draft','-15 days 1 second');
 assert.equal((await db.query('select sp_private.expire_flyer_drafts() n')).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from public.flyers where id='almost'")).rows[0].n,1);await db.exec('rollback');
 // Bounded batches prevent an unbounded maintenance transaction.
 await db.query("insert into public.flyers(company_id,id,data,updated_at) select $1,'batch-'||n,$2::jsonb,now()-interval '20 days' from generate_series(1,205) n",[company,{...design,elements:[]}]);
 assert.equal((await db.query('select sp_private.expire_flyer_drafts() n')).rows[0].n,200);
 assert.equal((await db.query('select sp_private.expire_flyer_drafts() n')).rows[0].n,5);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 assert.deepEqual(await rpc('sp_flyer_library',[foreign]),[]);await assert.rejects(()=>rpc('sp_flyer_library',[company]),/não autorizado/);
 assert.equal((await db.query('select count(*)::int n from public.flyers where company_id=$1',[company])).rows[0].n,0,'RLS filters cross-company direct reads');
 await db.exec('reset role');await db.query('update public.memberships set active=false where company_id=$1 and user_id=$2',[company,owner]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 await assert.rejects(()=>rpc('sp_flyer_library',[company]),/não autorizado/);
 await db.exec('reset role');await db.exec('set role anon');await assert.rejects(()=>rpc('sp_flyer_library',[company]),/permission denied/);
 await db.exec('reset role');
 assert.equal((await db.query("select has_function_privilege('anon','public.sp_flyer_library(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','sp_private.expire_flyer_drafts()','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select relrowsecurity enabled from pg_class where oid='public.flyers'::regclass")).rows[0].enabled,true);
 assert.equal((await db.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resource_changes'")).rows[0].n,1);
 console.log('PASS: compact flyer metadata/exact individual snapshot, server expiry timestamps, versions, scheduled 15-day retention, bounded cleanup, renewed/completed art preservation, delete signals/audit, RLS/tenant isolation and maintenance privilege denial.');
}catch(error){console.error(error.message,error.where||'',error.code||'');process.exitCode=1;}finally{await db.close();}
