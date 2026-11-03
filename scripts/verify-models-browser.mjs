// Optional browser regression against npm run dev. Every backend request is intercepted.
// This never authenticates against a real account or writes supermarket records.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { FLYER_MODEL_PRESETS } from '../interno/encartes/modelos/model.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4187';
const artifactDir = 'artifacts/models-browser';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const campaignId = '33333333-3333-4333-8333-333333333333';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'flyer@example.test', app_metadata: {}, user_metadata: {} };
const tokenPayload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${tokenPayload}.isolated-test`;
const company = { id: companyId, name: 'Loja de teste', modules: ['inicio', 'cadastros', 'modelos', 'galeria', 'encartes', 'promocoes'] };

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
function colorPhoto(red, green, blue, width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * (width * 4 + 1) + 1 + x * 4;
    pixels[index] = red; pixels[index + 1] = green; pixels[index + 2] = blue; pixels[index + 3] = 255;
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
const photos = [colorPhoto(190, 35, 50), colorPhoto(30, 120, 65), colorPhoto(40, 80, 170)];
const products = Array.from({ length: 12 }, (_, index) => ({
  id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, _version: 1,
  name: `PRODUTO DE TESTE ${index + 1}`, category: 'Mercearia', unit: 'UN', photos, photoAssets: [], photoCount: 3,
}));
const campaign = {
  id: campaignId, _version: 3, name: 'Ofertas da semana', start: '2026-11-03', end: '2026-11-10',
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
let failedSecondPage = true;
const pageResult = (items) => ({ items, page: 1, pages: 1, total: items.length, allTotal: items.length, perPage: 50, from: items.length ? 1 : 0, to: items.length, counts: {}, facets: {} });
const summary = (row) => Object.fromEntries(['id', 'title', 'status', 'width', 'height', 'createdAt', 'updatedAt', '_version'].map((key) => [key, row[key]]));

try {
  await mkdir(artifactDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const choose = async (selector, value) => {
    const control = page.locator(selector);
    const label = await control.locator(`option[value="${value}"]`).textContent();
    const trigger = control.locator('..').locator('.custom-select-trigger');
    if (!(await trigger.count())) { await control.selectOption(value); return; }
    await trigger.click();
    await page.locator('.custom-select-popup:not([hidden])').getByRole('option', { name: label, exact: true }).click();
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

  const waitSaved = async (predicate, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error(message);
  };
  const modelRecords = () => [...saved.values()].filter(row => row.id.startsWith('modelo_'));
  const slot = (design, field) => design.elements.find(element => element.id === `slot-1-${field}`);
  const geometry = element => Object.fromEntries(['x', 'y', 'width', 'height', 'rotation'].map(key => [key, element[key]]));
  await page.goto(origin);
  await page.locator('[name=email]').fill(user.email);
  await page.locator('[name=password]').fill('isolated-test');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.daily-metrics').waitFor();
  assert.equal(await page.locator('.sidebar a[href="#modelos"]').count(), 1);
  await page.evaluate(id => { location.hash = `modelos?promocao=${id}`; }, campaignId);
  await page.locator('.fm-grid .fm-card').first().waitFor();
  assert.equal(await page.locator('.fm-card').count(), FLYER_MODEL_PRESETS.length);
  for (const name of ['Natal', 'Fim de ano', 'Ano Novo', 'Verão']) {
    assert.ok((await page.locator('.fm-card h2').allTextContents()).some(text => text.toLowerCase().includes(name.toLowerCase())), `missing preset ${name}`);
  }
  for (const card of await page.locator('.fm-card').all()) await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => [...document.querySelectorAll('.fm-preview canvas')].every(canvas => canvas.classList.contains('is-ready')));
  await page.screenshot({ path: `${artifactDir}/library.png`, fullPage: true });
  await page.locator('[data-fm-action="create"]').first().click();
  await page.locator('.fm-create-form [name=title]').fill('Modelo de Natal ajustado');
  assert.equal(await page.locator('.fm-create-form [name=templateId]').inputValue(), 'grid-8');
  assert.equal(await page.locator('.fm-create-form [name=formatId]').inputValue(), 'story');
  await choose('.fm-create-form [name=presetId]', 'natal');
  await choose('.fm-create-form [name=templateId]', 'grid-6');
  await choose('.fm-create-form [name=formatId]', 'portrait');
  await page.locator('.fm-create-form button[type=submit]').click();
  await page.locator('.flyer-workspace-back').waitFor();
  await waitSaved(() => modelRecords().length === 1, 'new model not saved');
  const modelId = modelRecords()[0].id;
  const initialModel = structuredClone(saved.get(modelId));
  assert.equal(initialModel.status, 'created');
  assert.equal(slot(initialModel, 'foto').src, '');
  assert.equal(initialModel.publication, undefined);
  assert.equal(await page.locator('.flyer-save').textContent(), 'Salvar modelo');
  results.push('seasonal model library and creation of a persisted blank model');

  await page.locator('.studio-layer-row[data-id="slot-1-foto"] .studio-layer-select').click();
  const initialPhotoWidth = Number(await page.locator('.flyer-properties [name=width]').inputValue());
  await page.locator('[data-quick-adjust="image-larger"]').click();
  assert.ok(Number(await page.locator('.flyer-properties [name=width]').inputValue()) > initialPhotoWidth);
  await page.locator('.flyer-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => globalThis.Konva?.stages?.some(stage => stage.findOne('#slot-1-foto')));
  const position = await page.evaluate(() => {
    const stage = globalThis.Konva.stages.find(stage => stage.findOne('#slot-1-foto'));
    const node = stage.findOne('#slot-1-foto'), bounds = stage.container().getBoundingClientRect();
    const center = node.getAbsolutePosition();
    return { x: bounds.x + center.x, y: bounds.y + center.y };
  });
  const beforeDragX = Number(await page.locator('.flyer-properties [name=x]').inputValue());
  await page.keyboard.down('Alt');
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.mouse.move(position.x + 20, position.y + 12, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForFunction(oldX => Number(document.querySelector('.flyer-properties [name=x]')?.value) !== oldX, beforeDragX);
  await page.locator('.studio-layer-row[data-id="slot-1-nome"] .studio-layer-select').click();
  const initialFont = Number(await page.locator('.flyer-properties [name=fontSize]').inputValue());
  await page.locator('[data-quick-adjust="font-smaller"]').click();
  const editedFont = Number(await page.locator('.flyer-properties [name=fontSize]').inputValue());
  assert.equal(editedFont, initialFont - 2);
  await page.locator('.flyer-save').click();
  await waitSaved(() => slot(saved.get(modelId), 'nome').fontSize === editedFont, 'model adjustments not persisted');
  const editedModel = structuredClone(saved.get(modelId));
  assert.ok(slot(editedModel, 'foto').width > slot(initialModel, 'foto').width);
  assert.notEqual(slot(editedModel, 'foto').x, slot(initialModel, 'foto').x);
  assert.equal(slot(editedModel, 'foto').src, '', 'model remains blank after visual adjustments');
  const exportedModelReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar modelo', exact: true }).click();
  const exportedModel = await exportedModelReady;
  await exportedModel.saveAs(`${artifactDir}/modelo.json`);
  const exportedRecord = JSON.parse(await readFile(`${artifactDir}/modelo.json`, 'utf8'));
  assert.equal(exportedRecord.id, modelId);
  assert.equal(slot(exportedRecord, 'nome').fontSize, editedFont);
  await page.screenshot({ path: `${artifactDir}/editor.png`, fullPage: true });
  await page.locator('.flyer-workspace-back').click();
  await page.locator(`[data-fm-edit="${modelId}"]`).waitFor();
  await page.reload();
  await page.locator('[data-fm-tab="mine"]').click();
  await page.locator(`[data-fm-edit="${modelId}"]`).click();
  await page.locator('.studio-layer-row[data-id="slot-1-nome"] .studio-layer-select').click();
  assert.equal(Number(await page.locator('.flyer-properties [name=fontSize]').inputValue()), editedFont);
  await page.locator('.flyer-workspace-back').click();
  await page.locator(`[data-fm-use="${modelId}"]`).click();
  await page.locator('.fw-campaign-info strong').filter({ hasText: '12 produtos' }).waitFor();
  assert.equal(await page.locator('#fw-model').inputValue(), modelId);
  assert.equal(await page.locator('#fw-campaign').inputValue(), campaignId);
  results.push('image enlarged and dragged; smaller font persists after reload; promotion context preserved');

  await page.locator('.fw-generate').click();
  await page.locator('.fw-page-controls').filter({ hasText: 'Página 1 de 2' }).waitFor();
  await page.locator('[data-fw-action="save"]').click();
  await page.waitForFunction(() => document.querySelector('.fw-preview-heading p')?.textContent.includes('Salvo'));
  const pages = [...saved.values()].filter(row => row.publication).sort((a, b) => a.publication.pageIndex - b.publication.pageIndex);
  assert.equal(pages.length, 2);
  for (const generated of pages) {
    assert.deepEqual(geometry(slot(generated, 'foto')), geometry(slot(editedModel, 'foto')), 'photo geometry changed when model was filled');
    assert.equal(slot(generated, 'nome').fontSize, editedFont, 'edited font changed when model was filled');
  }
  assert.equal(slot(pages[0], 'foto').src, photos[0]);
  assert.equal(slot(pages[0], 'nome').text, campaign.items[0].name);
  assert.equal(slot(pages[0], 'preco').text, 'R$ 10,00');
  assert.equal(slot(pages[1], 'nome').text, campaign.items[6].name);
  assert.equal(slot(saved.get(modelId), 'foto').src, '', 'filling a promotion must not populate the reusable blank model');
  results.push('two promotion pages keep the saved model geometry/font and replace only product content');
  await page.screenshot({ path: `${artifactDir}/filled.png`, fullPage: true });

  for (const presetId of ['natal-ceia', 'natal-presentes', 'natal-semana']) {
    await choose('#fw-campaign', '');
    await choose('#fw-model', `preset:${presetId}`);
    await page.waitForFunction(key => document.querySelector('#fw-model')?.value === key &&
      !document.querySelector('#fw-model')?.disabled && document.querySelector('.fw-model-canvas')?.width > 0, `preset:${presetId}`);
    await page.locator('.fw-model-canvas').screenshot({ path: `${artifactDir}/${presetId}-blank.png` });
    await choose('#fw-campaign', campaignId);
    await page.locator('.fw-generate').click();
    await page.locator('.fw-page-controls').filter({ hasText: 'Página 1 de 2' }).waitFor();
    await page.locator('.fw-canvas').screenshot({ path: `${artifactDir}/${presetId}-filled.png` });
  }
  results.push('three Christmas layouts render blank and filled in Story format');

  await page.locator('.sidebar a[href="#galeria"]').click();
  await page.getByRole('heading', { name: 'Galeria de imagens', exact: true }).waitFor();
  await page.locator('[data-library-tab="created"]').click();
  assert.equal(await page.locator('.flyer-open-design').count(), 0, 'models and publication pages cannot leak into gallery created artwork');
  await page.locator('[data-library-tab="draft"]').click();
  await page.locator('.flyer-open-design strong').filter({ hasText: legacy.title }).waitFor();
  assert.deepEqual(await page.locator('.flyer-open-design strong').allTextContents(), [legacy.title]);
  await page.locator('.sidebar a[href="#modelos"]').click();
  await page.locator('[data-fm-tab="mine"]').click();
  await page.locator(`[data-fm-copy="${modelId}"]`).click();
  await page.locator('.flyer-workspace-back').waitFor();
  await waitSaved(() => modelRecords().length === 2, 'model duplicate not saved');
  assert.equal(modelRecords().filter(row => row.id !== modelId)[0]._version, 1, 'copy must start with a new revision');
  await page.locator('.flyer-workspace-back').click();
  const importFile = page.locator('.fm-import-file');
  await importFile.setInputFiles({ name: 'modelo-natal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportedRecord)) });
  await page.locator('.flyer-workspace-back').waitFor();
  await waitSaved(() => modelRecords().length === 3, 'imported model not saved');
  await page.locator('.flyer-workspace-back').click();
  await page.locator('.fm-import-file').setInputFiles({ name: 'limite.png', mimeType: 'image/png', buffer: Buffer.from(colorPhoto(80, 10, 40, 4097, 1).split(',')[1], 'base64') });
  await page.locator('.fm-create-form [name=title]').fill('Modelo com fundo enviado');
  await page.locator('.fm-create-form button[type=submit]').click();
  await page.locator('.fm-dialog-feedback').filter({ hasText: '4.096 pixels' }).waitFor();
  assert.equal(modelRecords().length, 3, 'invalid image must not create a model');
  const background = colorPhoto(235, 222, 200, 1080, 1920);
  await page.locator('.fm-create-form [name=background]').setInputFiles({ name: 'natal.png', mimeType: 'image/png', buffer: Buffer.from(background.split(',')[1], 'base64') });
  await page.locator('.fm-create-form button[type=submit]').click();
  await page.locator('.flyer-workspace-back').waitFor();
  await waitSaved(() => modelRecords().length === 4, 'model with uploaded background not saved');
  const uploaded = modelRecords().find(row => row.title === 'Modelo com fundo enviado');
  assert.equal(uploaded.width, 1080);
  assert.equal(uploaded.height, 1920);
  assert.equal(uploaded.elements.filter(element => /^slot-\d+-foto$/.test(element.id)).length, 8);
  assert.equal(uploaded.elements[0].id, 'fundo-importado');
  assert.equal(uploaded.elements[0].src, background);
  assert.equal(uploaded.elements[0].locked, true);
  assert.equal(uploaded.elements.some(element => element.type === 'shape'), false, 'preset decorations cannot cover an uploaded background');
  await page.locator('.flyer-workspace-back').click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const card of await page.locator('.fm-card').all()) await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => [...document.querySelectorAll('.fm-preview canvas')].every(canvas => canvas.classList.contains('is-ready')));
  await page.screenshot({ path: `${artifactDir}/mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  results.push('model JSON download/import and duplicate isolated from originals; PNG background creates 8 editable slots in Story format; invalid image refused; gallery preserved; mobile fits');
  await writeFile(`${artifactDir}/result.json`, JSON.stringify({ results, modelId, savedModels: modelRecords().length, errors, unexpected }, null, 2));
  console.log(JSON.stringify({ results, savedModels: modelRecords().length, errors, unexpected }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, unexpected, recentCalls: calls.slice(-8).map(({ name, params }) => ({ name, resource: params.p_resource })) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
