// Run against npm run dev with PLAYWRIGHT_MODULE, CHROME_PATH and optional TEST_ORIGIN.
// All backend traffic is intercepted. This test never uses a real account or writes real data.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const quoteId = '33333333-3333-4333-8333-333333333333';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'navigation@example.test', app_metadata: {}, user_metadata: {} };
const tokenPayload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${tokenPayload}.isolated-test`;
const company = { id: companyId, name: 'Loja de teste', modules: ['inicio', 'cadastros', 'cotacao', 'hortifruti', 'acougue', 'devolucoes', 'calendario', 'promocoes', 'tabela-precos', 'encartes', 'configuracoes'] };
const item = { id: 'item', productId: 'product', name: 'ARROZ PARA TESTE', category: 'Mercearia', unit: 'UN', quantity: 1 };
const provider = { id: 'supplier', name: 'FORNECEDOR DE TESTE' };
const quote = { id: quoteId, _version: 1, title: 'Cotação de navegação', date: '2026-11-03', status: 'open', items: [item], providers: [provider], offers: { item: { supplier: 1250 } }, awards: {}, finalizedProviders: {}, computed: {
  comparisons: { item: { min: 1250, lowest: ['supplier'], priced: 1 } }, lineTotals: { item: { supplier: 1250 } },
  totals: [{ ...provider, subtotal: 1250, total: 1250, complete: true }],
  awardedByProvider: [{ ...provider, items: [], total: 0 }], selectedTotal: 0, lowestCompleteCount: 1,
} };
const pageResult = (items = []) => ({ items, page: 1, pages: 1, total: items.length, allTotal: items.length, perPage: 20, from: items.length ? 1 : 0, to: items.length, counts: {}, facets: { categories: [], statusCounts: {} } });
const settingRows = {
  company_settings: [{ id: 'default', _version: 1, name: 'Loja de teste' }],
  watermarks: [{ id: 'default', _version: 1, type: 'text', text: 'TESTE', opacity: 15, size: 24, rotation: 0 }],
  headers: [{ id: 'default', _version: 1, title: 'Loja de teste', subtitle: '', alignment: 'left', showLogo: true, showContact: true }],
};
const errors = [], unexpected = [], calls = [], cssRequests = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.routeWebSocket('**/realtime/**', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      if (url.pathname.endsWith('.css')) {
        cssRequests.push(url.pathname);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (url.pathname.includes('/chunks/')) await new Promise((resolve) => setTimeout(resolve, 75));
      return route.continue();
    }
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
      else if (name === 'sp_get' && params.p_resource === 'quotes') data = quote;
      else if (name === 'sp_list') data = settingRows[params.p_resource] ?? (params.p_resource === 'units' ? [{ id: 'unit', name: 'Unidade', symbol: 'UN', _version: 1 }] : []);
      else if (name === 'sp_resource_page' || name === 'sp_product_page') data = pageResult();
      else if (name === 'sp_calculate') data = { products: 0, quotes: 1, purchases: 0, campaigns: 0, printing: 0 };
      else if (['sp_campaign_calendar', 'sp_flyer_library', 'sp_brand_asset_metadata'].includes(name)) data = [];
      else { unexpected.push({ name, params }); data = []; }
    } else { unexpected.push(url.pathname); data = {}; }
    await route.fulfill({ json: data });
  });
  await page.addInitScript(() => {
    window.__unstyledFrames = [];
    window.__observedFrames = 0;
    const sample = () => {
      const overview = document.querySelector('.quote-overview');
      const matrix = document.querySelector('.quote-matrix-wrap');
      if (overview || matrix) window.__observedFrames++;
      if (overview && getComputedStyle(overview).display !== 'grid') window.__unstyledFrames.push('summary');
      if (matrix && getComputedStyle(matrix).overflowX !== 'auto') window.__unstyledFrames.push('matrix');
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto(origin);
  await page.locator('[name=email]').fill(user.email);
  await page.locator('[name=password]').fill('isolated-test');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.daily-metrics').waitFor();
  await page.evaluate(() => { window.__sidebar = document.querySelector('.sidebar'); window.__header = document.querySelector('.topbar'); });
  const routes = [
    ['cotacao', 'Cotação'], ['hortifruti', 'Hortifruti'], ['acougue', 'Açougue'], ['devolucoes', 'Devoluções'],
    ['calendario', 'Calendário'], ['promocoes', 'Promoções'], ['tabela-precos', 'Tabela de preços'],
    ['galeria', 'Galeria de imagens'], ['encartes', 'Encartes'], ['configuracoes', 'Configurações'],
    ['cadastros/parceiros', 'Parceiros'], ['cadastros/produtos', 'Produtos'], ['cadastros/categorias', 'Categorias'],
    ['cadastros/unidades', 'Unidades de medida'], ['cadastros/acougue', 'Açougue'],
    ['cadastros/modelos-cartaz', 'Modelos de cartaz'], ['cadastros/biblioteca-marca', 'Biblioteca'],
    ['configuracoes/empresa', 'Empresa'], ['configuracoes/usuarios', 'Usuários'], ['configuracoes/perfis', 'Perfis'],
    ['configuracoes/marca-dagua', 'Marca d’água'], ['configuracoes/cabecalho', 'Cabeçalho'],
  ];
  for (const [hash, label] of routes) {
    await page.evaluate((hash) => { location.hash = hash; }, hash);
    await page.locator('#content h1').filter({ hasText: label }).waitFor();
    assert(await page.evaluate(() => window.__sidebar === document.querySelector('.sidebar') && window.__header === document.querySelector('.topbar')), `${hash}: shell replaced`);
    assert.equal(await page.locator('#content link[rel="stylesheet"]').count(), 0, `${hash}: transient stylesheet`);
    results.push(hash);
  }
  await page.evaluate((id) => { location.hash = `cotacao/${id}`; }, quoteId);
  await page.locator('.quote-overview').waitFor();
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const label of ['Produtos', 'Fornecedores', 'Comparativo final', 'Resumo']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#content link[rel="stylesheet"]').count(), 0);
    }
  }
  assert.equal(await page.getByText('Confira as quantidades solicitadas.', { exact: false }).count(), 0);
  await page.getByRole('tab', { name: 'Produtos', exact: true }).click();
  assert.equal(await page.getByText('Digite os preços unitários;', { exact: false }).count(), 0);
  const quoteReads = () => calls.filter((call) => call.name === 'sp_get' && call.params.p_resource === 'quotes').length;
  assert.equal(quoteReads(), 1, 'tabs refetched the quote');
  await page.locator('.sidebar a[href="#configuracoes"]').click();
  await page.locator('.settings-grid').waitFor();
  await page.evaluate((id) => { location.hash = `cotacao/${id}`; }, quoteId);
  await page.locator('.quote-overview').waitFor();
  assert.equal(quoteReads(), 1, 'return discarded fresh query cache');
  // A same-route event must not replace an active form or lose its draft.
  const input = page.locator('.quote-quantity-form input').first();
  await input.fill('7');
  await input.evaluate((node) => { window.__draftInput = node; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  assert(await input.evaluate((node) => node === window.__draftInput));
  assert.equal(await input.inputValue(), '7');
  // Only the latest route is allowed to win a rapid series of transitions.
  await page.evaluate(async () => {
    for (const route of ['hortifruti', 'acougue', 'promocoes', 'configuracoes', 'cotacao']) {
      location.hash = route;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  await page.locator('#content h1').filter({ hasText: 'Cotação' }).waitFor();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  assert.equal(await page.locator('#content h1').innerText(), 'Cotação');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('.sidebar a[href="#configuracoes"]').click();
  await page.locator('.settings-grid').waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  await page.evaluate((id) => { location.hash = `cotacao/${id}`; }, quoteId);
  await page.locator('.quote-overview').waitFor();
  await page.getByRole('tab', { name: 'Produtos', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile quote overflow');
  const frames = await page.evaluate(() => ({ unstyled: window.__unstyledFrames, observed: window.__observedFrames }));
  assert(frames.observed > 20, 'not enough rendered frames inspected');
  assert.deepEqual(frames.unstyled, [], 'unstyled content became visible');
  assert.equal(cssRequests.length, 1, 'navigation requested additional CSS');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1, 'document reloaded');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const report = { mode: 'isolated backend; CSS delayed 350 ms, JS chunks delayed 75 ms', routes: results, tabs: 16, mobile: true, rapidNavigation: true, draftPreserved: true, quoteReads: quoteReads(), cssRequests, frames, errors };
  await mkdir('artifacts/navigation', { recursive: true });
  await page.screenshot({ path: 'artifacts/navigation/quote-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/navigation/quote-desktop.png', fullPage: true });
  await writeFile('artifacts/navigation/browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
