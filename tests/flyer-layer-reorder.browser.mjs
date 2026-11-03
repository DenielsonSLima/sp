// Isolated panel: exercises real pointer gestures without loading or saving any artwork.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4187';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__layers_check', route => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/shared/base.css"><link rel="stylesheet" href="/interno/encartes/styles.css">
    <style>body{padding:20px}.flyer-layers-panel{width:300px;height:420px;box-sizing:border-box}</style>
    </head><body><aside class="flyer-layers-panel"></aside></body></html>` }));
  await page.goto(origin + '/__layers_check');
  await page.evaluate(async () => {
    const { createLayersPanel } = await import('/interno/encartes/layers-panel.js');
    const { moveLayer } = await import('/interno/encartes/editor/layer-reorder.js');
    const { createHistory } = await import('/interno/encartes/model.js');
    window.setup = (count = 6) => {
      window.panel?.destroy();
      window.design = { elements: Array.from({ length: count }, (_, index) => ({
        id: `layer-${index}`, type: 'text', text: `Camada ${index}`, locked: index === 2,
        hidden: false, x: 10, y: 20,
      })) };
      window.layerHistory = createHistory(window.design);
      window.selection = `layer-${count - 1}`;
      window.commits = 0;
      const redraw = () => window.panel.update(window.design, window.selection);
      window.panel = createLayersPanel(document.querySelector('.flyer-layers-panel'), {
        onSelect(id) { window.selection = id; redraw(); },
        onMove(id, delta) {
          const next = structuredClone(window.design);
          if (moveLayer(next.elements, id, delta)) {
            window.design = window.layerHistory.commit(next);
            window.commits++;
            redraw();
          }
        },
        onToggleVisibility(id) { window.design.elements.find(element => element.id === id).hidden ^= true; redraw(); },
        onToggleLock(id) { window.design.elements.find(element => element.id === id).locked ^= true; redraw(); },
      });
      redraw();
    };
    window.setup();
  });
  const ids = () => page.locator('.studio-layer-row').evaluateAll(rows => rows.map(row => row.dataset.id));
  const row = id => page.locator(`.studio-layer-row[data-id="layer-${id}"]`);
  const point = async (id, fraction = .5) => {
    const box = await row(id).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height * fraction };
  };
  const begin = async id => {
    const start = await point(id);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 2 });
  };
  const drop = async (id, fraction) => {
    const target = await point(id, fraction);
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  };
  // Move the first row past multiple layers, then return it to the front.
  await begin(5);
  await drop(3, .9);
  assert.deepEqual(await ids(), ['layer-4', 'layer-3', 'layer-5', 'layer-2', 'layer-1', 'layer-0']);
  assert.equal(await page.evaluate(() => window.commits), 1);
  assert.equal(await row(5).locator('.studio-layer-select').getAttribute('aria-pressed'), 'true');
  await begin(5);
  await drop(4, .1);
  assert.deepEqual(await ids(), ['layer-5', 'layer-4', 'layer-3', 'layer-2', 'layer-1', 'layer-0']);
  assert.equal(await page.evaluate(() => window.commits), 2);
  // A cancelled gesture and a release outside the list never change the stack.
  await begin(5);
  const target = await point(3, .9);
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.commits), 2);
  await begin(5);
  await page.mouse.move(700, 650, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.commits), 2);
  assert.equal(await page.locator('.is-reordering,.layer-drop-before,.layer-drop-after').count(), 0);
  await row(4).locator('.studio-layer-select').click();
  assert.equal(await page.evaluate(() => window.selection), 'layer-4');
  await row(4).locator('.studio-layer-visibility').click();
  assert.equal(await page.evaluate(() => window.commits), 2);
  assert.equal(await row(4).locator('.studio-layer-visibility').getAttribute('aria-pressed'), 'false');
  // Existing keyboard-accessible order controls still use the same mutations.
  await page.getByRole('button', { name: 'Descer', exact: true }).click();
  assert.deepEqual((await ids()).slice(0, 4), ['layer-5', 'layer-3', 'layer-4', 'layer-2']);
  // Long lists scroll while the pointer is held near their lower edge.
  await page.evaluate(() => window.setup(18));
  await begin(17);
  const list = await page.locator('.studio-layer-list').boundingBox();
  await page.mouse.move(list.x + list.width / 2, list.y + list.height - 8, { steps: 8 });
  await page.waitForFunction(() => document.querySelector('.studio-layer-list').scrollTop > 120);
  assert.equal(await page.evaluate(() => window.commits), 0, 'no mutation before release');
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.commits), 1);
  assert((await ids()).indexOf('layer-17') > 1);
  await page.evaluate(() => {
    window.design = window.layerHistory.undo();
    window.panel.update(window.design, window.selection);
  });
  assert.equal((await ids())[0], 'layer-17');
  await page.evaluate(() => window.panel.destroy());
  assert.equal(await page.locator('.is-reordering,.layer-drop-before,.layer-drop-after').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: pointer reorder up/down, insertion order, selection, cancel/outside, visibility, order buttons, edge scrolling, single history step, undo and cleanup.');
} finally {
  await browser.close();
}
