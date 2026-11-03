import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlyerPdf, planFlyerPdf, MAX_FLYER_PDF_BYTES } from '../interno/encartes/workspace/pdf.js';

const page = (formatId = 'portrait', width = 1080, height = 1350) => ({
  width, height, bgColor: '#fff', elements: [], publication: { formatId },
});
const jpeg = new Uint8Array([255, 216, 255, 217]);

function browser(t, toBlob = (callback) => callback(new Blob([jpeg], { type: 'image/jpeg' }))) {
  const previous = globalThis.document, canvases = [], rendered = [];
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = {
        width: 0, height: 0,
        getContext() { return { scale() {}, fillRect() {} }; },
        toBlob(callback, type, quality) {
          rendered.push([this.width, this.height]);
          toBlob(callback, type, quality);
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  t.after(() => { globalThis.document = previous; });
  return { canvases, rendered };
}

test('flyer PDF plan preserves physical A4 and contains rounded pixel dimensions without stretching', () => {
  const input = [page('a4', 1240, 1754), page('a4', 1240, 1754)];
  const plan = planFlyerPdf(input), placement = plan.pages[0][0];
  assert.equal(plan.widthMm, 210);
  assert.equal(plan.heightMm, 297);
  assert.equal(plan.pages.length, 2);
  assert.equal(placement.offer, input[0]);
  assert.equal(plan.pages[1][0].offer, input[1]);
  assert.ok(Math.abs(placement.widthMm / placement.heightMm - 1240 / 1754) < 1e-12);
  assert.ok(placement.xMm >= 0 && placement.yMm >= 0);
  assert.ok(placement.widthMm <= 210 && placement.heightMm <= 297);
  const social = planFlyerPdf([page('story', 1080, 1920)]);
  assert.ok(Math.abs(social.widthMm / social.heightMm - 1080 / 1920) < 1e-12);
});

test('flyer PDF rejects empty, oversized and mixed-format page sets before rendering', () => {
  assert.throws(() => planFlyerPdf([]), /Adicione páginas/);
  assert.throws(() => planFlyerPdf(Array.from({ length: 201 }, () => page())), /200 páginas/);
  assert.throws(() => planFlyerPdf([page(), page('story')]), /mesmo formato/);
  assert.throws(() => planFlyerPdf([page(), page('portrait', 1080, 1080)]), /mesmo formato/);
  assert.throws(() => planFlyerPdf([page('unknown')]), /formato.*inválido/);
});

test('flyer export produces one A4 PDF page per design, reports progress and releases canvases', async (t) => {
  const env = browser(t), progress = [];
  const blob = await createFlyerPdf([page('a4', 1240, 1754), page('a4', 1240, 1754)], {
    onProgress: (done, total) => progress.push([done, total]),
  });
  const pdf = await blob.text();
  assert.equal(blob.type, 'application/pdf');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Count 2/);
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(pdf, /\/MediaBox \[0 0 595\.27559 841\.88976\]/);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.deepEqual(env.rendered, [[2480, 3508], [2480, 3508]]);
  assert.ok(env.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});

test('flyer export cancels stale work and releases its canvas', async (t) => {
  let current = true;
  const env = browser(t, (callback) => { current = false; callback(new Blob([jpeg], { type: 'image/jpeg' })); });
  await assert.rejects(() => createFlyerPdf([page(), page()], { isCurrent: () => current }), /cancelada/);
  assert.equal(env.canvases.length, 1);
  assert.equal(env.canvases[0].width, 0);
  assert.equal(env.canvases[0].height, 0);
});

test('flyer export rejects null and oversized raster output before allocating PDF bytes', async (t) => {
  let output = null, allocated = false;
  const env = browser(t, (callback) => callback(output));
  await assert.rejects(() => createFlyerPdf([page()]), /imagem de uma página/);
  output = { size: MAX_FLYER_PDF_BYTES + 1, type: 'image/jpeg', arrayBuffer() { allocated = true; } };
  await assert.rejects(() => createFlyerPdf([page()]), /100 MB/);
  assert.equal(allocated, false);
  assert.ok(env.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});
