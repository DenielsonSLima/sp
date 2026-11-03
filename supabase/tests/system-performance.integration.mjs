import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsider = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmxkAAAAASUVORK5CYII=';
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, index) => '$' + (index + 1)).join(',')}) result`, args,
)).rows[0].result;
const page = (company, resource, overrides = {}) => rpc('sp_resource_page', [company, resource,
  overrides.page ?? 1, overrides.perPage ?? 2, overrides.query ?? '', overrides.status ?? '',
  overrides.start ?? '', overrides.end ?? '', overrides.category ?? '', overrides.archived ?? 'active']);

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime; create schema storage;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of ['schema.sql', 'catalog-schema.sql',
    'migrations/20261031031813_optimize_product_media_rpc.sql',
    'migrations/20261031032723_product_photo_storage.sql',
    'migrations/20261031043008_product_server_pagination.sql',
    'migrations/20261031070000_brand_asset_metadata.sql',
    'migrations/20261102030237_brand_asset_previews.sql',
    'migrations/20261102040347_resource_summary_pages.sql',
    'migrations/20261102040438_metadata_and_realtime_mutation.sql',
    'migrations/20261102040852_product_thumbnails.sql']) {
    await db.exec(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users values($1,$2),($3,$4)', [owner, 'perf@example.com', outsider, 'other@example.com']);
  const company = (await db.query("select sp_private.bootstrap_company('perf@example.com','Loja A') id")).rows[0].id;
  const other = (await db.query("select sp_private.bootstrap_company('other@example.com','Loja B') id")).rows[0].id;
  const large = 'data:image/png;base64,' + 'A'.repeat(300000);
  for (let index = 0; index < 5; index++) {
    await db.query('insert into public.quotes(company_id,id,data,created_at) values($1,$2,$3,$4)', [company, 'q' + index,
      { title: `Cotação ${index}`, date: '2026-11-02', status: index < 3 ? 'open' : 'finished',
        items: [{ id: 'line', name: 'Café especial', category: 'Mercearia', photo: large }],
        providers: [{ id: 'partner' }], awards: { line: 'partner' } }, `2026-11-0${index + 1}`]);
  }
  const fixtures = {
    hortifruti_receipts: { date: '2026-11-02', status: 'pending', partner: { name: 'Parceiro' },
      items: [{ name: 'Banana', photo: large }], computed: { summary: { total: 1234, incomplete: 1 } } },
    butcher_receipts: { category: 'Bovino', receivedDate: '2026-11-02', weightGrams: 5000,
      rows: [{ grams: 5000 }], animalCount: 1, modelName: 'Modelo', modelVersion: 2 },
    supplier_returns: { number: '12', originalInvoice: '99', date: '2026-11-02', supplier: { name: 'Fornecedor' },
      items: [{ name: 'Café', photo: large }], computed: { totals: { status: 'Parcial', total: 1000, pending: 500 } } },
    campaigns: { name: 'Semana', start: '2026-11-01', end: '2026-11-07', status: 'active', notes: 'Oferta', items: [{ photo: large }] },
    price_tables: { name: 'Café', status: 'sent', cents: 1234, quantity: 2, productSnapshot: { code: 'CAFE', photo: large },
      templateSnapshot: { name: 'A4', dataURL: large } },
  };
  for (const [resource, data] of Object.entries(fixtures))
    await db.query(`insert into public.${resource}(company_id,id,data) values($1,'one',$2)`, [company, data]);
  await db.query("insert into public.price_tables(company_id,id,data) values($1,'old',$2)", [company,
    { name: 'Arquivado', status: 'finalized', archivedAt: '2026-11-02' }]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const first = await page(company, 'quotes');
  assert.equal(first.total, 5); assert.equal(first.pages, 3); assert.equal(first.items.length, 2);
  assert.deepEqual(first.items.map(item => item.id), ['q4', 'q3']);
  assert(first.items.every(item => item.itemCount === 1 && item.providerCount === 1 && item.selectedCount === 1));
  assert.deepEqual(first.facets.categories, ['Mercearia']); assert.equal(first.counts.open, 3);
  assert(JSON.stringify(first).length < 2000); assert(!JSON.stringify(first).includes('base64'));
  assert.equal((await page(company, 'quotes', { page: 99 })).page, 3);
  assert.equal((await page(company, 'quotes', { query: 'cafe', status: 'open', category: 'Mercearia' })).total, 3);
  assert.equal((await page(company, 'quotes', { start: '2026-11-03' })).total, 0);
  for (const resource of Object.keys(fixtures)) {
    const result = await page(company, resource);
    assert.equal(result.total, 1); assert(!JSON.stringify(result).includes('base64'));
  }
  assert.deepEqual((await page(company, 'hortifruti_receipts')).items[0].summary, { total: 1234, incomplete: 1 });
  assert.equal((await page(company, 'butcher_receipts')).items[0].rowCount, 1);
  assert.equal((await page(company, 'supplier_returns', { status: 'Parcial' })).items[0].totals.pending, 500);
  assert.equal((await page(company, 'price_tables')).counts.sent, 1);
  assert.equal((await page(company, 'price_tables', { archived: 'archived' })).items[0].id, 'old');
  assert.equal((await rpc('sp_campaign_calendar', [company, '2026-11-05', '2026-11-06'])).length, 1);
  assert.equal((await rpc('sp_campaign_calendar', [company, '2026-11-08', '2026-11-09'])).length, 0);
  for (const filters of [{ perPage: 500 }, { start: 'invalid' }, { start: '2026-11-03', end: '2026-11-01' }, { archived: 'bad' }])
    await assert.rejects(() => page(company, 'quotes', filters), /inválido/);
  await assert.rejects(() => page(company, 'products'), /paginação operacional/);
  await assert.rejects(() => page(other, 'quotes'), /não autorizado/);
  await assert.rejects(() => rpc('sp_campaign_calendar', [other, '2026-11-01', '2026-11-03']), /não autorizado/);

  const mutation = '11111111-1111-4111-8111-111111111111';
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-sp-mutation-id': mutation })]);
  let asset = await rpc('sp_save', [company, 'brand_assets', { id: 'logo', name: 'Original', category: 'Logos', dataURL: png,
    previewDataURL: png, width: 1, height: 1 }, null]);
  const meta = await rpc('sp_brand_asset_metadata_update', [company, asset.id, 'Renomeado', 'Logos', asset._version]);
  assert.equal(meta._version, 2); assert(!JSON.stringify(meta).includes('base64'));
  asset = await rpc('sp_get', [company, 'brand_assets', 'logo']);
  assert.equal(asset.dataURL, png); assert.equal(asset.previewDataURL, png);
  assert.equal((await db.query("select mutation_id from public.resource_changes where company_id=$1 and resource='brand_assets'", [company])).rows[0].mutation_id, mutation);
  await assert.rejects(() => rpc('sp_brand_asset_metadata_update', [company, 'logo', 'Antigo', 'Logos', 1]), /biblioteca mudou/);
  await assert.rejects(() => rpc('sp_brand_asset_metadata_update', [other, 'logo', 'Nome', 'Logos', 2]), /não autorizado/);
  await assert.rejects(() => rpc('sp_brand_asset_metadata_update', [company, 'logo', 'Nome', 'Inexistente', 2]), /categoria válida/);
  await db.query("select set_config('request.headers','{}',false)");
  await rpc('sp_delete', [company, 'brand_assets', 'logo', 2]);
  assert.equal((await db.query("select mutation_id from public.resource_changes where company_id=$1 and resource='brand_assets'", [company])).rows[0].mutation_id, null);

  await rpc('sp_save', [company, 'product_categories', { id: 'cat', name: 'Mercearia' }, null]);
  let product = await rpc('sp_save', [company, 'products', { id: 'coffee', name: 'Café', category: 'Mercearia', unit: 'UN', photos: [png] }, null]);
  const before = await rpc('sp_get', [company, 'products', product.id]);
  const confirmation = await rpc('sp_product_thumbnail_save', [company, product.id, product._version, png]);
  assert.equal(confirmation._version, 2);
  const after = await rpc('sp_get', [company, 'products', product.id]);
  assert.deepEqual({ ...after, _version: 1 }, before, 'thumbnail maintenance preserves complete original document');
  assert.equal((await rpc('sp_product_previews', [company, [product.id]]))[0].isThumbnail, true);
  assert.equal((await rpc('sp_product_media', [company, [product.id]]))[0].photos[0], png);
  await assert.rejects(() => rpc('sp_product_thumbnail_save', [company, product.id, 1, png]), /catálogo mudou/);
  await assert.rejects(() => rpc('sp_product_thumbnail_save', [company, product.id, 2, 'data:image/png;base64,AAAA']), /inválido/);
  await assert.rejects(() => rpc('sp_product_thumbnail_save', [other, product.id, 2, png]), /não autorizado/);
  await rpc('sp_product_gallery', [company, product.id, [], [], 2]);
  assert.equal((await rpc('sp_product_previews', [company, [product.id]]))[0].isThumbnail, false, 'changed primary clears derivative');
  await db.exec('reset role');
  const archiveMigration = readFileSync(new URL('../migrations/20261102043841_price_table_archive_schedule.sql', import.meta.url), 'utf8');
  await db.exec(archiveMigration.slice(0, archiveMigration.indexOf('select cron.schedule')));
  const oldTime = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString();
  const recentTime = new Date().toISOString();
  for (const [id, extra] of [['expired', {}], ['restored', { restoredAt: recentTime }], ['recent', { finalizedAt: recentTime }]])
    await db.query('insert into public.price_tables(company_id,id,data) values($1,$2,$3)', [company, id,
      { name: id, status: 'finalized', finalizedAt: oldTime, productSnapshot: { photo: png }, ...extra }]);
  assert.equal((await db.query('select sp_private.archive_expired_price_tables() result')).rows[0].result, 1);
  assert.equal((await db.query("select version from public.price_tables where company_id=$1 and id='expired'", [company])).rows[0].version, 2);
  assert.equal((await db.query("select data#>>'{productSnapshot,photo}' photo from public.price_tables where company_id=$1 and id='expired'", [company])).rows[0].photo, png);
  assert.equal((await db.query('select sp_private.archive_expired_price_tables() result')).rows[0].result, 0);
  await db.exec('set role authenticated');
  await assert.rejects(() => db.query('select sp_private.archive_expired_price_tables()'), /permission denied/);
  await db.exec('reset role');
  await db.query('update public.memberships set active=false where company_id=$1 and user_id=$2', [company, owner]);
  await db.exec('set role authenticated');
  await assert.rejects(() => page(company, 'quotes'), /não autorizado/);
  await assert.rejects(() => rpc('sp_product_thumbnail_save', [company, product.id, 3, png]), /não autorizado/);
  await db.exec('reset role'); await db.exec('set role anon');
  await assert.rejects(() => page(company, 'quotes'), /permission denied/);
  await assert.rejects(() => rpc('sp_brand_asset_metadata_update', [company, 'logo', 'Nome', 'Logos', 2]), /permission denied/);
  await assert.rejects(() => rpc('sp_product_thumbnail_save', [company, product.id, 3, png]), /permission denied/);
  console.log('PASS: six bounded summary pages, filters/facets/totals, calendar intersection, tenant/anon denial, metadata-only rename, mutation correlation/deletion, thumbnail preservation/version/invalidation.');
} catch (error) {
  console.error(error.message, error.where || '', error.code || ''); process.exitCode = 1;
} finally { await db.close(); }
