// Optional browser regression against npm run dev. Every backend request is intercepted.
// This never authenticates against a real account or writes supermarket records.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4187';
const artifactDir = 'artifacts/encartes-workspace-browser';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const campaignId = '33333333-3333-4333-8333-333333333333';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'flyer@example.test', app_metadata: {}, user_metadata: {} };
const tokenPayload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${tokenPayload}.isolated-test`;
const company = { id: companyId, name: 'Loja de teste', modules: ['inicio', 'cadastros', 'encartes', 'promocoes'] };

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function colorPhoto(red, green, blue) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, red, green, blue, 255]))), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
const photos = [colorPhoto(190, 35, 50), colorPhoto(30, 120, 65), colorPhoto(40, 80, 170)];
const products = Array.from({ length: 14 }, (_, index) => ({
  id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, _version: 1,
  name: `PRODUTO DE TESTE ${index + 1}`, category: 'Mercearia', unit: 'UN', photos, photoAssets: [], photoCount: 3,
}));
const campaign = {
  id: campaignId, _version: 3,
  name: 'Ofertas especiais da semana com alimentos, bebidas, mercearia e produtos para toda a família',
  start: '2026-11-03', end: '2026-11-10',
  notes: '', omitValidity: false,
  items: products.map((product, index) => ({
    id: `item-${index + 1}`, productId: product.id, name: product.name,
    displayName: index === 2 ? 'ARROZ BRANCO TIPO 1 PACOTE ECONÔMICO PARA A FAMÍLIA 5 KG' : product.name,
    cents: 1000 + index * 127, unit: 'unid', quantity: 1,
  })),
};
const date = '2026-11-03T12:00:00.000Z';
const legacy = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', _version: 1, title: 'Arte existente preservada',
  status: 'draft', width: 1080, height: 1920, bgColor: '#ffffff', elements: [], createdAt: date, updatedAt: date,
};
const saved = new Map([[legacy.id, legacy]]), calls = [], errors = [], unexpected = [], results = [];
const previewMetrics = [];
let failedSecondPage = false;
const pageResult = (items) => ({ items, page: 1, pages: 1, total: items.length, allTotal: items.length, perPage: 50, from: items.length ? 1 : 0, to: items.length, counts: {}, facets: {} });
const summary = (row) => Object.fromEntries(['id', 'title', 'status', 'width', 'height', 'createdAt', 'updatedAt', '_version'].map((key) => [key, row[key]]));

try {
  await mkdir(artifactDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, acceptDownloads: true });
  const choose = async (selector, value) => {
    const control = page.locator(selector);
    const label = await control.locator(`option[value="${value}"]`).textContent();
    await control.locator('..').locator('.custom-select-trigger').click();
    await page.locator('.custom-select-popup:not([hidden])').getByRole('option', { name: label, exact: true }).click();
  };
  const assertSharpPreview = async (label) => {
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.fw-canvas');
      if (!canvas) return false;
      const bounds = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio;
      return bounds.width > 0 && bounds.height > 0 && canvas.width >= bounds.width * ratio - 2 &&
        canvas.height >= bounds.height * ratio - 2;
    });
    previewMetrics.push(await page.locator('.fw-canvas').evaluate((canvas, label) => {
      const bounds = canvas.getBoundingClientRect();
      return { label, bitmap: [canvas.width, canvas.height], css: [bounds.width, bounds.height], dpr: devicePixelRatio };
    }, label));
  };
  const downloadPng = async (filename, expectedSize) => {
    assert.equal(await page.locator('[data-fw-action="png"]').count(), 1, 'one clear PNG action');
    const button = page.locator('.fw-preview-heading [data-fw-action="png"]');
    assert.match(await button.getAttribute('class'), /\bprimary\b/, 'PNG must be the primary action at the top');
    assert.equal(await page.locator('[data-fw-action="pdf"]').count(), 0, 'PDF must not appear in the workspace');
    const ready = page.waitForEvent('download');
    await button.click();
    const download = await ready;
    assert.match(download.suggestedFilename(), /\.png$/i);
    await download.saveAs(`${artifactDir}/${filename}`);
    const png = await readFile(`${artifactDir}/${filename}`);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], expectedSize, 'download must retain native document resolution');
    return { bytes: png, name: download.suggestedFilename() };
  };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.routeWebSocket('**/realtime/**', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'enhoierfwuwtzulznjxa.supabase.co') {
      unexpected.push(request.url());
      return route.abort();
    }
    let data;
    if (url.pathname.endsWith('/auth/v1/token')) data = { access_token: token, refresh_token: 'isolated-test', expires_in: 3600, token_type: 'bearer', user };
    else if (url.pathname.endsWith('/auth/v1/user')) data = user;
    else if (url.pathname.endsWith('/auth/v1/logout')) data = {};
    else if (url.pathname.includes('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1), params = request.postDataJSON();
      calls.push({ name, params });
      if (name === 'sp_context') data = { companyId, user, companies: [company] };
      else if (name === 'sp_resource_page' && params.p_resource === 'campaigns') data = pageResult([{ ...campaign, items: undefined, itemCount: campaign.items.length }]);
      else if (name === 'sp_get') {
        if (params.p_resource === 'campaigns') data = campaign;
        else if (params.p_resource === 'products') data = products.find((item) => item.id === params.p_id);
        else if (params.p_resource === 'flyers') data = saved.get(params.p_id) || null;
        else { unexpected.push({ name, params }); data = null; }
      } else if (name === 'sp_list') {
        if (params.p_resource === 'products') data = products.map(({ photos, ...product }) => ({ ...product, hasPhotos: true }));
        else data = [];
      } else if (name === 'sp_flyer_library') data = [...saved.values()].map(summary);
      else if (name === 'sp_flyer_save' || name === 'sp_flyer_save_delta') {
        const record = structuredClone(params.p_record), previous = saved.get(record.id);
        assert.equal(params.p_expected_version, previous?._version ?? null, 'write must carry the opened revision');
        if (!failedSecondPage && record.publication?.pageIndex === 1) {
          failedSecondPage = true;
          return route.fulfill({ status: 500, json: {
            code: 'XX000', message: 'Falha simulada ao salvar a segunda página.', details: null, hint: null,
          } });
        }
        for (const ref of params.p_image_refs || []) record.elements[ref.target][ref.field] = previous.elements[ref.source][ref.sourceField];
        const ack = { id: record.id, _version: (previous?._version || 0) + 1, createdAt: previous?.createdAt || date, updatedAt: new Date().toISOString() };
        saved.set(record.id, { ...record, ...ack });
        data = ack;
      } else if (name === 'sp_calculate') data = { products: 14, quotes: 0, purchases: 0, campaigns: 1, printing: 0 };
      else if (name === 'sp_brand_asset_metadata' || name === 'sp_campaign_calendar') data = [];
      else { unexpected.push({ name, params }); data = []; }
    } else { unexpected.push(url.pathname); data = {}; }
    await route.fulfill({ json: data });
  });

  await page.goto(origin);
  await page.locator('[name=email]').fill(user.email);
  await page.locator('[name=password]').fill('isolated-test');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.daily-metrics').waitFor();
  assert.equal(await page.locator('.sidebar a[href="#galeria"]').count(), 1);
  await page.locator('.sidebar a[href="#encartes"]').click();
  await page.locator('#fw-campaign option').filter({ hasText: campaign.name }).waitFor({ state: 'attached' });
  await choose('#fw-campaign', campaignId);
  await page.locator('[data-fw-photo="0"] option[value="2"]').waitFor({ state: 'attached' });
  await choose('[data-fw-photo="0"]', '2');
  await page.locator('.fw-generate').click();
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 1 de 2' }).waitFor();
  await assertSharpPreview('Story page 1, desktop DPR 2');
  const storyFirst = await downloadPng('story-page-1.png', [1080, 1920]);
  await page.locator('[data-fw-action="next"]').click();
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 2 de 2' }).waitFor();
  const storySecond = await downloadPng('story-page-2.png', [1080, 1920]);
  assert.notEqual(storyFirst.name, storySecond.name, 'page filenames must remain distinguishable');
  assert.match(storyFirst.name, /-pagina-1\.png$/);
  assert.match(storySecond.name, /-pagina-2\.png$/);
  assert.equal(storyFirst.bytes.equals(storySecond.bytes), false, 'PNG must represent the selected page');
  results.push('top primary PNG action exports either Story page at native 1080 × 1920; no PDF action');
  await choose('#fw-template', 'grid-9');
  await choose('#fw-format', 'a4');
  await choose('#fw-model', 'preset:natal');
  await page.locator('.fw-generate').click();
  await page.waitForFunction(() => document.querySelector('.fw-canvas')?.width > 0);
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 1 de 2' }).waitFor();
  await assertSharpPreview('A4 page 1, desktop DPR 2');
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: `${artifactDir}/desktop.png`, fullPage: true });
  await page.locator('[data-fw-action="save"]').click();
  await page.locator('.fw-feedback.error').filter({ hasText: '1 de 2 páginas salvas' }).waitFor();
  assert.equal(failedSecondPage, true);
  const partialPages = [...saved.values()].filter((row) => row.publication);
  assert.equal(partialPages.length, 1, 'the first confirmed page must remain saved after the second fails');
  assert.equal(partialPages[0].publication.pageIndex, 0);
  assert.equal(partialPages[0].status, 'created');
  const firstPageId = partialPages[0].id, firstVersion = partialPages[0]._version;
  const firstWriteAttempts = calls.filter(({ name, params }) => /^sp_flyer_save/.test(name) && params.p_record?.publication);
  assert.equal(firstWriteAttempts.length, 2, 'a failed mutation must not retry itself');
  const secondPageId = firstWriteAttempts.find(({ params }) => params.p_record.publication.pageIndex === 1).params.p_record.id;
  await page.locator('[data-fw-action="save"]').click();
  await page.waitForFunction(() => document.querySelector('.fw-preview-heading p')?.textContent.includes('Salvo'));
  const publicationPages = [...saved.values()].filter((row) => row.publication).sort((a, b) => a.publication.pageIndex - b.publication.pageIndex);
  assert.equal(publicationPages.length, 2);
  assert.deepEqual(publicationPages.map((row) => row.id), [firstPageId, secondPageId], 'retry must complete the same publication without duplicate pages');
  assert.equal(saved.get(firstPageId)._version, firstVersion, 'retry must not rewrite the already confirmed page');
  assert.equal(calls.filter(({ name, params }) => /^sp_flyer_save/.test(name) && params.p_record?.id === firstPageId).length, 1);
  assert.equal(calls.filter(({ name, params }) => /^sp_flyer_save/.test(name) && params.p_record?.id === secondPageId).length, 2);
  results.push('partial save reports 1 of 2 pages; explicit retry completes the same IDs without rewriting page 1');
  assert.deepEqual(publicationPages.map((row) => row.publication.pageIndex), [0, 1]);
  assert.ok(publicationPages.every((row) => row.publication.pageCount === 2 && row.publication.formatId === 'a4' && row.publication.themeId === 'natal'));
  const names = publicationPages.flatMap((row) => row.elements.filter((element) => /^slot-\d+-nome$/.test(element.id)).map((element) => element.text));
  assert.deepEqual(names, campaign.items.map((item) => item.displayName || item.name), 'every campaign item must appear once, in saved order');
  assert.equal(publicationPages[0].elements.find((element) => element.id === 'slot-1-foto').src, photos[2]);
  const prices = publicationPages.flatMap((row) => row.elements.filter((element) => /^slot-\d+-preco$/.test(element.id)).map((element) => element.text));
  assert.deepEqual(prices, campaign.items.map((item) => `R$ ${(item.cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`));
  results.push('14 products preserved without repetitions; selected photo, price, theme and page metadata saved');

  await page.locator('[data-fw-action="next"]').click();
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 2 de 2' }).waitFor();
  await downloadPng('page-2.png', [1240, 1754]);
  results.push('A4 page PNG download retains native 1240 × 1754 dimensions');

  await page.locator('[data-fw-tab="saved"]').click();
  await page.locator('[data-fw-open]').waitFor();
  assert.equal(await page.locator('[data-fw-open]').count(), 1);
  await page.reload();
  await page.locator('[data-fw-tab="saved"]').click();
  await page.locator('[data-fw-open]').click();
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 1 de 2' }).waitFor();
  await downloadPng('reopened-page-1.png', [1240, 1754]);
  await page.locator('[data-fw-action="edit"]').click();
  await page.locator('.flyer-workspace-back').waitFor();
  await page.locator('#flyer-title').fill('Página ajustada no editor');
  await page.locator('#flyer-title').press('Tab');
  await page.locator('.flyer-workspace-back').click();
  await page.locator('.fw-canvas').waitFor();
  assert.ok([...saved.values()].filter((row) => row.publication).every((row) => row.status === 'created'), 'returning from the editor must preserve completed publication status');
  await page.locator('[data-fw-action="save"]').click();
  await page.waitForFunction(() => document.querySelector('.fw-preview-heading p')?.textContent.includes('Salvo'));
  const editedPages = [...saved.values()].filter((row) => row.publication);
  assert.ok(editedPages.some((row) => row.title === 'Página ajustada no editor'));
  assert.ok(editedPages.every((row) => row.status === 'created'), 'editing must not turn publication pages into expiring drafts');
  results.push('saved publication reopens after reload; page remains editable and returns to its publication');

  await page.locator('.sidebar a[href="#galeria"]').click();
  await page.getByRole('heading', { name: 'Galeria de imagens', exact: true }).waitFor();
  await page.locator('[data-library-tab="draft"]').click();
  await page.locator('.flyer-open-design strong').filter({ hasText: legacy.title }).waitFor();
  assert.deepEqual(await page.locator('.flyer-open-design strong').allTextContents(), [legacy.title], 'gallery drafts must contain only the existing artwork');
  assert.ok(saved.has(legacy.id));
  await page.locator('.sidebar a[href="#encartes"]').click();
  await page.locator('[data-fw-tab="saved"]').click();
  await page.locator('[data-fw-open]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertSharpPreview('A4 reopened page 1, mobile DPR 2');
  await page.screenshot({ path: `${artifactDir}/mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  results.push('existing gallery preserved; mobile fits viewport; previews cover CSS display pixels at DPR 2');
  await writeFile(`${artifactDir}/result.json`, JSON.stringify({ results, previewMetrics, calls: calls.map(({ name, params }) => ({ name, resource: params.p_resource })), errors, unexpected }, null, 2));
  console.log(JSON.stringify({ results, previewMetrics, savedPages: publicationPages.length, errors, unexpected }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, unexpected, recentCalls: calls.slice(-8).map(({ name, params }) => ({ name, resource: params.p_resource })) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
