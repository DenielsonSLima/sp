import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRasterScale } from '../interno/encartes/preview-resolution.js';
import { renderDesign, validateCanvasSize } from '../interno/encartes/renderer.js';

const story = { width: 1080, height: 1920, elements: [] };
const canvas = () => ({ getContext: () => ({ scale() {}, fillRect() {} }) });

test('Story editor at 100 percent uses two bitmap pixels per CSS pixel on a Retina screen', async () => {
  const preview = canvas();
  await renderDesign(preview, story, { scale: previewRasterScale(story, {
    width: 1080, height: 1920, pixelRatio: 2,
  }) });
  assert.equal(preview.width, 2160);
  assert.equal(preview.height, 3840);
});

test('browser zoom at 125 percent gets enough raster pixels for the visible artwork', async () => {
  const preview = canvas();
  await renderDesign(preview, story, { scale: previewRasterScale(story, {
    width: 1080, height: 1920, pixelRatio: 1.25,
  }) });
  assert.equal(preview.width, 1350);
  assert.equal(preview.height, 2400);
});

test('portrait thumbnails rasterize the contained image, accounting for screen density', async () => {
  const preview = canvas();
  await renderDesign(preview, story, { scale: previewRasterScale(story, {
    width: 320, height: 256, pixelRatio: 2,
  }) });
  assert.equal(preview.width, 288);
  assert.equal(preview.height, 512);
});

test('large editor zoom respects canvas dimensions and memory budget without changing export size', async () => {
  for (const design of [story, { ...story, width: 4000, height: 4000 }]) {
    const preview = canvas();
    await renderDesign(preview, design, { scale: previewRasterScale(design, {
      width: design.width * 3, height: design.height * 3, pixelRatio: 3,
    }) });
    assert.doesNotThrow(() => validateCanvasSize(preview.width, preview.height));
    assert.ok(preview.width * preview.height <= 16000000);
  }
  const exported = canvas();
  await renderDesign(exported, story);
  assert.equal(exported.width, 1080);
  assert.equal(exported.height, 1920);
});

test('fitted views keep existing supersampling instead of reducing detail on low-density screens', async () => {
  const preview = canvas();
  await renderDesign(preview, story, { scale: previewRasterScale(story, {
    width: 200, height: 356, pixelRatio: 1, minimumScale: 1400 / story.height,
  }) });
  assert.equal(preview.height, 1400);
});
