import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;`);
  await db.exec(file('../schema.sql'));
  await db.exec(file('../migrations/20261102024909_flyer_write_validation.sql'));
  await db.exec(file('../migrations/20261102160917_flyer_reuse_saved_images.sql'));
  await db.query('insert into auth.users values($1,$2),($3,$4)', [owner,'reuse-a@example.com',other,'reuse-b@example.com']);
  const company = (await db.query("select sp_private.bootstrap_company('reuse-a@example.com','A') id")).rows[0].id;
  const foreign = (await db.query("select sp_private.bootstrap_company('reuse-b@example.com','B') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const source = 'data:image/png;base64,' + 'ABCD'.repeat(1_025_000);
  const shape = { id:'photo', type:'image', x:0,y:0,width:1080,height:1920 };
  const doc = { id:'large',title:'Art',status:'draft',width:1080,height:1920,elements:[{...shape,src:source}] };
  await rpc('sp_flyer_save',[company,doc,null]);
  const changed = {...doc,status:'created',elements:[{...shape,x:12}, {...shape,id:'copy',y:14}]};
  const refs = [0,1].map(target=>({target,field:'src',source:0,sourceField:'src'}));
  const revision = async () => (await db.query("select revision from public.resource_changes where company_id=$1 and resource='flyers'",[company])).rows[0].revision;
  const signalBefore = await revision();
  const ack = await rpc('sp_flyer_save_delta',[company,changed,1,refs]);
  assert.equal(ack._version,2); assert.ok(await revision()>signalBefore);
  const stored = await rpc('sp_get',[company,'flyers',doc.id]);
  assert.equal(stored.status,'created'); assert.equal(stored.elements[0].src,source);
  assert.equal(stored.elements[1].src,source); assert.equal(stored.elements[0].x,12);
  assert.deepEqual(Object.keys(ack).sort(),['id','_version','createdAt','updatedAt'].sort());
  await assert.rejects(rpc('sp_flyer_save_delta',[company,changed,1,refs]),/alterado/);
  await assert.rejects(rpc('sp_flyer_save_delta',[company,changed,null,refs]),/alterado/);
  await assert.rejects(rpc('sp_flyer_save_delta',[foreign,changed,2,refs]),/não autorizado/);
  await assert.rejects(rpc('sp_flyer_save_delta',[company,{...changed,id:'missing'},2,refs]),/removido/);
  for (const invalid of [null,{},[null],[{...refs[0],target:-1}],[{...refs[0],target:20}],
    [{...refs[0],source:20}],[{...refs[0],field:'title'}],[{...refs[0],sourceField:'type'}],
    [refs[0],refs[0]],Array(401).fill(refs[0]),[{...refs[0],source:1.5}]])
    await assert.rejects(rpc('sp_flyer_save_delta',[company,changed,2,invalid]));
  await assert.rejects(rpc('sp_flyer_save_delta',[company,doc,2,refs]),/inválidas/);
  await assert.rejects(rpc('sp_flyer_save_delta',[company,{...changed,width:0},2,refs]),/inválid/);
  assert.equal((await rpc('sp_get',[company,'flyers',doc.id]))._version,2,'failed operations leave revision unchanged');
  assert.equal(await revision(),signalBefore+1,'failed operations produce no committed resource signal');
  // Existing full-snapshot clients and new clients use the same version protection.
  assert.equal((await rpc('sp_flyer_save',[company,doc,2]))._version,3);
  await db.exec('reset role');
  const audits=(await db.query("select version from public.audit_log where company_id=$1 and resource='flyers' and record_id='large' order by version",[company])).rows;
  assert.deepEqual(audits.map(a=>a.version),[1,2,3]);
  assert.equal((await db.query("select relrowsecurity enabled from pg_class where oid='public.flyers'::regclass")).rows[0].enabled,true);
  assert.equal((await db.query("select has_table_privilege('authenticated','public.flyers','INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,false);
  await db.exec('set role anon');
  await assert.rejects(rpc('sp_flyer_save_delta',[company,changed,3,refs]),/permission denied/);
  await db.exec('reset role');
  await db.query('update public.memberships set active=false where company_id=$1 and user_id=$2',[company,owner]);
  await db.exec('set role authenticated');
  await assert.rejects(rpc('sp_flyer_save_delta',[company,changed,3,refs]),/não autorizado/);
  console.log('PASS: exact image reuse, reorder/duplicate targets, full-client compatibility, conflicts, malformed refs, tenant permissions, revoked users, RLS, audit and Realtime.');
  console.log(JSON.stringify({fullBytes:Buffer.byteLength(JSON.stringify(doc)),deltaBytes:Buffer.byteLength(JSON.stringify({record:changed,imageRefs:refs}))}));
} catch(error) { console.error(error); process.exitCode=1; } finally {await db.close();}
