import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { FLYER_MODEL_PRESETS, createBlankFlyerModel, isFlyerModel, modelSlotCount }
  from '../../interno/encartes/modelos/model.js';
import { generateFlyerPages } from '../../interno/encartes/generator/index.js';
import { compactFlyerWrite } from '../../shared/data/flyer-write.js';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const photo = 'data:image/png;base64,AAAA';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result;

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;`);
  await db.exec(read('../schema.sql'));
  // The unchanged deployed RPC definitions, excluding only the unrelated cron registration.
  await db.exec(read('../migrations/20261102005446_flyer_library_draft_retention.sql').split('-- Only unfinished drafts expire')[0]);
  await db.exec(read('../migrations/20261102024909_flyer_write_validation.sql'));
  await db.exec(read('../migrations/20261102160917_flyer_reuse_saved_images.sql'));
  await db.query('insert into auth.users values($1,$2),($3,$4)',
    [owner, 'model-owner@example.test', other, 'model-other@example.test']);
  const company = (await db.query("select sp_private.bootstrap_company('model-owner@example.test','Loja A') id")).rows[0].id;
  const foreign = (await db.query("select sp_private.bootstrap_company('model-other@example.test','Loja B') id")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');

  let first;
  for (const preset of FLYER_MODEL_PRESETS) {
    const model = createBlankFlyerModel({ presetId: preset.id, logo: photo });
    const ack = await rpc('sp_flyer_save', [company, model, null]);
    assert.equal(ack._version, 1);
    const saved = await rpc('sp_get', [company, 'flyers', model.id]);
    assert.deepEqual(saved.elements, model.elements, 'RPC preserves every slot, empty image and editable style');
    assert.equal(saved.status, 'created');
    assert.equal(modelSlotCount(saved), 8);
    assert(saved.elements.filter(e => /^slot-\d+-foto$/.test(e.id)).every(e => e.src === ''));
    first ||= saved;
  }
  const library = await rpc('sp_flyer_library', [company]);
  assert.equal(library.length, FLYER_MODEL_PRESETS.length);
  assert(library.every(row => isFlyerModel(row) && row.status === 'created' && row.expiresAt === null));
  assert(library.every(row => !Object.hasOwn(row, 'elements')), 'the model library retains compact metadata reads');

  const revision = async () => (await db.query(
    "select revision from public.resource_changes where company_id=$1 and resource='flyers'", [company],
  )).rows[0].revision;
  const beforeRevision = await revision();
  const edit = structuredClone(first);
  const image = edit.elements.find(e => e.id === 'slot-1-foto');
  image.x += 13;
  image.width -= 26;
  image.height += 7;
  image.rotation = 4;
  const name = edit.elements.find(e => e.id === 'slot-1-nome');
  name.fontSize = 18;
  name.fontFamily = 'Georgia';
  name.align = 'left';
  const payload = compactFlyerWrite(edit, first, first._version);
  assert(payload.imageRefs.length > 0, 'uploaded decoration is reused by the existing delta RPC');
  assert(payload.imageRefs.every(ref => !/^slot-\d+-foto$/.test(payload.record.elements[ref.target].id)),
    'empty placeholders are never sent as saved-image references');
  const ack = await rpc('sp_flyer_save_delta', [company, payload.record, first._version, payload.imageRefs]);
  assert.equal(ack._version, 2);
  const updated = await rpc('sp_get', [company, 'flyers', first.id]);
  assert.deepEqual(updated.elements, edit.elements, 'delta saves retain edited sizes, positions and font settings');
  assert((await revision()) > beforeRevision, 'template edits invalidate the existing flyers resource');
  await assert.rejects(() => rpc('sp_flyer_save_delta', [company, payload.record, 1, payload.imageRefs]), /alterado/);

  const campaign = { id: 'campaign-model-test', name: 'Ofertas de teste', start: '2026-11-03', end: '2026-11-10',
    items: Array.from({ length: 9 }, (_, index) => ({
      id: `item-${index}`, productId: `sku-${index}`, name: `Produto ${index}`, cents: 1099 + index, unit: 'unid',
    })) };
  const pages = generateFlyerPages(campaign, { model: updated,
    photos: new Map(campaign.items.map(item => [item.productId, photo])) });
  assert.equal(pages.length, 2);
  for (const page of pages) {
    await rpc('sp_flyer_save', [company, { ...page, status: 'created' }, null]);
    const saved = await rpc('sp_get', [company, 'flyers', page.id]);
    assert.deepEqual(saved.elements, page.elements);
    assert.equal(saved.elements.find(e => e.id === 'slot-1-nome').fontSize, 18);
    assert.equal(saved.elements.find(e => e.id === 'slot-1-foto').x, image.x);
  }
  assert.equal((await rpc('sp_get', [company, 'flyers', first.id])).elements.find(e => e.id === 'slot-1-foto').src, '',
    'using a model never fills or overwrites its reusable blank slots');
  await assert.rejects(() => rpc('sp_flyer_save', [foreign, edit, null]), /não autorizado/);
  await assert.rejects(() => rpc('sp_get', [foreign, 'flyers', first.id]), /não autorizado/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  await assert.rejects(() => rpc('sp_flyer_library', [company]), /não autorizado/);
  await assert.rejects(() => rpc('sp_flyer_save_delta', [company, payload.record, 2, payload.imageRefs]), /não autorizado/);
  await db.exec('reset role; set role anon');
  await assert.rejects(() => rpc('sp_flyer_save', [company, edit, null]), /permission denied/);
  console.log('PASS: seasonal models persist through existing full/delta RPCs with blank slots, exact geometry/fonts, durable library metadata, version conflicts, Realtime invalidation and tenant isolation; generated pages preserve edits without modifying the reusable model.');
} catch (error) {
  console.error(error.message, error.where || '', error.code || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
