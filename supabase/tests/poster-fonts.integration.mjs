import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { FONT_GROUPS } from '../../interno/cadastros/modelos-cartaz/fonts.js';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsider = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result;
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;`);
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/20261102030842_poster_free_fonts.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1,$2),($3,$4)', [owner, 'fonts-owner@example.com', outsider, 'fonts-other@example.com']);
  const company = (await db.query("select sp_private.bootstrap_company('fonts-owner@example.com','Fonts') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  let template = await rpc('sp_get', [company, 'poster_templates', 'large']);
  const old = structuredClone(template);
  for (const family of Object.values(FONT_GROUPS).flat()) {
    const layout = Object.fromEntries(Object.entries(template.layout).map(([key, value]) => [key, { ...value, fontFamily: family }]));
    template = await rpc('sp_save', [company, 'poster_templates', { ...template, font: family, layout }, template._version]);
    const saved = await rpc('sp_get', [company, 'poster_templates', template.id]);
    assert.equal(saved.font, family);
    for (const element of Object.values(saved.layout)) assert.equal(element.fontFamily, family);
  }
  await assert.rejects(rpc('sp_save', [company, 'poster_templates', old, old._version]), /outra sessão/);
  await assert.rejects(rpc('sp_save', [company, 'poster_templates', { ...template, font: 'url(evil)' }, template._version]), /fonte/);
  const bad = structuredClone(template); bad.layout.price.fontFamily = 'Unlicensed';
  await assert.rejects(rpc('sp_save', [company, 'poster_templates', bad, template._version]), /Fonte/);
  bad.layout.price.fontFamily = 'Anton'; bad.layout.price.x = 2;
  await assert.rejects(rpc('sp_save', [company, 'poster_templates', bad, template._version]), /dentro da folha/);
  await assert.rejects(db.query('select sp_private.validate_template($1)', [template]), /permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from public.resource_changes where company_id=$1 and resource='poster_templates'", [company])).rows[0].n, 1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
  await db.exec('set role authenticated');
  await assert.rejects(rpc('sp_save', [company, 'poster_templates', template, template._version]), /não autorizado/);
  assert.equal((await db.query('select count(*)::int n from public.poster_templates')).rows[0].n, 0);
  console.log('PASS: all 25 fonts saved/read through RPC, invalid fonts/geometry rejected, concurrency, company isolation, private grants and Realtime preserved.');
} finally {
  await db.close();
}
