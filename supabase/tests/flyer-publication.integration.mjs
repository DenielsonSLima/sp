import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { publicationId, groupPublicationSummaries } from '../../interno/encartes/publication.js';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result;
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;`);
  await db.exec(read('../schema.sql'));
  // Execute the deployed library definition exactly. Its unrelated pg_cron
  // retention job is tested by flyer-library-retention.integration.mjs.
  await db.exec(read('../migrations/20261102005446_flyer_library_draft_retention.sql').split('-- Only unfinished drafts expire')[0]);
  await db.exec(read('../migrations/20261102024909_flyer_write_validation.sql'));
  await db.exec(read('../migrations/20261102160917_flyer_reuse_saved_images.sql'));
  await db.query('insert into auth.users values($1,$2),($3,$4)',
    [owner, 'publication-owner@example.test', other, 'publication-other@example.test']);
  const company = (await db.query("select sp_private.bootstrap_company('publication-owner@example.test','Loja A') id")).rows[0].id;
  const foreign = (await db.query("select sp_private.bootstrap_company('publication-other@example.test','Loja B') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const groupId = '11111111-1111-4111-8111-111111111111';
  for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
    const publication = { kind: 'campaign', groupId, campaignId: 'promotion-1', campaignVersion: 4,
      pageIndex, pageCount: 2, templateId: 'grid-6', themeId: 'povo', formatId: 'portrait' };
    const doc = { id: publicationId(groupId, pageIndex), title: 'Ofertas da semana', status: 'created',
      width: 1080, height: 1350, publication,
      elements: [{ id: 'photo', type: 'image', src: 'data:image/png;base64,AAAA', x: 10, y: 10, width: 100, height: 100 }] };
    const ack = await rpc('sp_flyer_save', [company, doc, null]);
    assert.equal(ack._version, 1);
    const detail = await rpc('sp_get', [company, 'flyers', doc.id]);
    assert.deepEqual(detail.publication, publication);
    const update = { ...doc, title: 'Título editado', elements: [{ ...doc.elements[0], src: '' }] };
    await rpc('sp_flyer_save_delta', [company, update, 1, [{ target: 0, source: 0, field: 'src', sourceField: 'src' }]]);
    const updated = await rpc('sp_get', [company, 'flyers', doc.id]);
    assert.deepEqual(updated.publication, publication);
    assert.equal(updated.elements[0].src, doc.elements[0].src);
    await assert.rejects(() => rpc('sp_flyer_save', [company, doc, 1]), /alterado/);
  }
  const rows = await rpc('sp_flyer_library', [company]);
  assert(rows.every((row) => !Object.hasOwn(row, 'publication') && !Object.hasOwn(row, 'elements')));
  const groups = groupPublicationSummaries(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pages.map((page) => page.pageIndex), [0, 1]);
  await assert.rejects(() => rpc('sp_flyer_library', [foreign]), /não autorizado/);
  await db.exec('reset role;set role anon');
  await assert.rejects(() => rpc('sp_flyer_library', [company]), /permission denied/);
  console.log('PASS: existing RPCs preserve publication through full/delta saves; compact library groups by namespace; versions, company isolation and anonymous denial remain enforced.');
} catch (error) {
  console.error(error.message, error.where || '', error.code || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
