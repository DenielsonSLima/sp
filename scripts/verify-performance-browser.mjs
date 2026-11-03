// Optional: PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs node scripts/verify-performance-browser.mjs
// Uses an isolated browser and intercepted responses; never writes to the real database.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const companyId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'teste@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const payload = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.isolated-test`;
const context = { companyId, user, companies: [{ id: companyId, name: 'Loja de teste', modules: ['inicio', 'cadastros', 'cotacao', 'hortifruti', 'acougue', 'devolucoes', 'promocoes', 'tabela-precos', 'calendario', 'encartes', 'configuracoes'] }] };
const rpcCalls = [], errors = [], unexpected = [], missing = [], results = [];
function summary(resource, index) {
  const common = { id: `${resource}-${index}`, _version: 1 };
  const byResource = {
    quotes: { title: `Cotação ${index}`, date: '2026-11-02', status: 'open', itemCount: 3, providerCount: 2, selectedCount: 1, categories: ['Mercearia'] },
    hortifruti_receipts: { date: '2026-11-02', status: 'draft', partner: { name: `Fornecedor ${index}` }, itemCount: 3, itemNames: ['Banana'], entryConfirmed: false, weighed: false, summary: { total: null, incomplete: true } },
    butcher_receipts: { category: 'Bovino', reference: `Lote ${index}`, receivedDate: '2026-11-02', weightGrams: 120000, animalCount: 1, modelName: 'Cortes', modelVersion: 1, totalBps: 10000, rowCount: 4 },
    supplier_returns: { number: String(index), originalInvoice: '123', date: '2026-11-02', supplier: { name: 'Fornecedor' }, itemCount: 1, totals: { status: 'Pendente', total: 10000, pending: 10000 }, status: 'Pendente' },
    campaigns: { name: `Campanha ${index}`, start: '2026-11-01', end: '2026-11-30', notes: '', status: 'active', itemCount: 3 },
    price_tables: { name: `Produto ${index}`, status: 'draft', cents: 1200, quantity: 1, templateName: 'Padrão', start: '', end: '' },
  };
  return { ...common, ...byResource[resource] };
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.url().startsWith(origin) && response.status() >= 400 && !response.url().endsWith('favicon.ico')) missing.push(response.url()); });
  await page.routeWebSocket('**/realtime/**', (socket) => socket.close());
  await page.route('https://enhoierfwuwtzulznjxa.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.endsWith('/auth/v1/token')) data = { access_token: token, refresh_token: 'isolated-test', expires_in: 3600, token_type: 'bearer', user };
    else if (url.pathname.endsWith('/auth/v1/user')) data = user;
    else if (url.pathname.includes('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1), params = route.request().postDataJSON();
      rpcCalls.push({ name, params });
      if (name === 'sp_context') data = context;
      else if (name === 'sp_resource_page') {
        const total = 25, perPage = params.p_per_page, current = params.p_page;
        const from = (current - 1) * perPage, to = Math.min(from + perPage, total);
        data = { items: Array.from({ length: to - from }, (_, i) => summary(params.p_resource, from + i + 1)), page: current, pages: Math.ceil(total / perPage), total, allTotal: total, perPage, from: from + 1, to, counts: { open: 25, draft: 25, active: 25 }, facets: { categories: ['Mercearia'], statusCounts: { open: 25 } } };
      } else if (name === 'sp_calculate') data = { products: 25, quotes: 25, purchases: 25, campaigns: 25, printing: 25 };
      else if (name === 'sp_list' && ['home_notices', 'calendar_events'].includes(params.p_resource)) data = [];
      else if (name === 'sp_campaign_calendar') data = [];
      else { unexpected.push({ name, params }); data = []; }
    } else { unexpected.push({ url: url.pathname }); data = {}; }
    await route.fulfill({ json: data });
  });
  await page.goto(origin);
  await page.locator('[name=email]').fill('teste@example.test');
  await page.locator('[name=password]').fill('isolated-test');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.locator('.daily-metrics').waitFor();
  if (process.argv.includes('--rebuild')) {
    const previous = JSON.parse(await readFile('dist/app/manifest.json', 'utf8'));
    let finished = false;
    const rebuild = promisify(execFile)(process.execPath, ['build.mjs', '--preserve-chunks']).finally(() => { finished = true; });
    const checked = [];
    while (!finished) {
      checked.push((await fetch(origin)).status);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await rebuild;
    assert(checked.length && checked.every((status) => status === 200), 'partial dist served during rebuild');
    for (const file of Object.keys(previous.outputs)) {
      assert.equal((await fetch(origin + '/' + file.replace(/^dist\//, ''), { method: 'HEAD' })).status, 200, `old dependency removed: ${file}`);
    }
    results.push({ rebuild: 'preserved live page and previous dependencies', probes: checked.length });
  }
  await page.evaluate(() => { window.__shellSidebar = document.querySelector('.sidebar'); window.__shellHeader = document.querySelector('.topbar'); });
  const flows = [
    ['cotacao', 'quotes', '.quote-grid', '[name=query]', 20],
    ['hortifruti', 'hortifruti_receipts', '.hf-grid', '[name=query]', 20],
    ['acougue', 'butcher_receipts', '.butcher-receipts-grid', '[name=query]', 12],
    ['devolucoes', 'supplier_returns', '.return-grid', '[name=query]', 20],
    ['promocoes', 'campaigns', '.campaign-grid', '.campaign-query', 12],
    ['tabela-precos', 'price_tables', '.tp-grid', '.tp-search', 20],
  ];
  for (const [hash, resource, grid, input, count] of flows) {
    await page.locator(`.sidebar a[href="#${hash}"]`).click();
    await page.waitForFunction(({ grid, count }) => document.querySelector(grid)?.children.length === count, { grid, count });
    assert(await page.evaluate(() => window.__shellSidebar === document.querySelector('.sidebar') && window.__shellHeader === document.querySelector('.topbar')), `${hash}: shell rebuilt`);
    const field = page.locator(`#content ${input}`);
    await field.evaluate((element) => { window.__searchInput = element; window.__firstCard = element.closest('#content').querySelector('[aria-busy]')?.firstElementChild; });
    await page.evaluate((selector) => { window.__firstCard = document.querySelector(selector).firstElementChild; }, grid);
    const initial = rpcCalls.filter((call) => call.name === 'sp_resource_page' && call.params.p_resource === resource).length;
    await field.pressSequentially('abcdefghijkl', { delay: 12 });
    await page.waitForFunction(({ grid }) => !document.querySelector(grid)?.hasAttribute('aria-busy'), { grid });
    assert.equal(rpcCalls.filter((call) => call.name === 'sp_resource_page' && call.params.p_resource === resource).length, initial + 1, `${hash}: debounce`);
    assert(await field.evaluate((element) => element === window.__searchInput && document.activeElement === element), `${hash}: lost input/focus`);
    assert(await page.evaluate((selector) => window.__firstCard === document.querySelector(selector).firstElementChild, grid), `${hash}: rebuilt unchanged card`);
    await page.locator('[data-page-next]').click();
    await page.waitForFunction(() => document.querySelector('[data-page-label]')?.textContent.includes('Página 2'));
    results.push({ route: hash, pageSize: count, checks: ['stable-shell', 'one-search-request', 'stable-input-focus', 'incremental-cards', 'next-page'] });
  }
  await page.locator('.sidebar a[href="#calendario"]').click();
  await page.locator('.calendar-board').waitFor();
  assert(rpcCalls.some((call) => call.name === 'sp_campaign_calendar'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('.sidebar a[href="#cotacao"]').click();
  await page.locator('.quote-grid > *').first().waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  assert.deepEqual(unexpected, []);
  await mkdir('artifacts/auditoria-sistema-20261102', { recursive: true });
  await writeFile('artifacts/auditoria-sistema-20261102/browser-corrections.json', JSON.stringify({ mode: 'isolated mocked backend; no real writes', results, rpcCount: rpcCalls.length, errors, missing, unexpected }, null, 2));
  console.log(JSON.stringify({ passed: results, mobile: true, calendarPeriod: true, rpcCount: rpcCalls.length, errors, missing }));
} finally { await browser.close(); }
