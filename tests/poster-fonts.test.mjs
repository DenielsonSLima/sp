import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FONTS, FONT_GROUPS, loadPosterFonts } from '../interno/cadastros/modelos-cartaz/fonts.js';
import { defaultLayout, templateSettings } from '../interno/cadastros/modelos-cartaz/definition.js';

test('20 bundled fonts have original licenses, intact WOFF2 assets and valid templates', async () => {
  const root = new URL('../assets/fonts/posters/', import.meta.url);
  const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
  const css = await readFile(new URL('fonts.css', root), 'utf8');
  assert.equal(catalog.length, 20);
  assert.equal(new Set(FONTS).size, 25);
  for (const font of catalog) {
    assert.ok(FONTS.includes(font.family));
    assert.match(await readFile(new URL(font.licenseFile, root), 'utf8'), /SIL OPEN FONT LICENSE/);
    for (const file of font.files) {
      const bytes = await readFile(new URL(file.filename, root));
      assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.ok(css.includes(`./${file.filename}`));
    }
    const template = templateSettings({ font: font.family, scale: 1, widthMm: 210, heightMm: 297,
      color: '#111111', background: '#ffffff', layout: defaultLayout(font.family) });
    assert.equal(template.layout.price.fontFamily, font.family);
  }
  assert.equal(FONT_GROUPS['Fontes do sistema'].length, 5);
  assert.ok(!css.includes('https://'));
});

test('PDF loads both used weights, deduplicates fonts and skips hidden elements', async () => {
  const layout = defaultLayout('Montserrat');
  layout.validity = { ...layout.validity, fontFamily: 'Lato', hidden: true };
  const calls = [];
  await loadPosterFonts({ layout }, { ready: Promise.resolve(), load: async (font) => {
    calls.push(font); return [{}];
  } });
  assert.deepEqual(calls.sort(), ['700 24px "Montserrat"', '900 24px "Montserrat"']);
});

test('PDF reports unavailable bundled fonts instead of silently exporting a fallback', async () => {
  const template = { layout: defaultLayout('Anton') };
  await assert.rejects(loadPosterFonts(template, { ready: Promise.resolve(), load: async () => [] }), /carregar a fonte Anton/);
  await assert.rejects(loadPosterFonts(template, { ready: Promise.resolve(), load: async () => { throw Error('offline'); } }), /carregar a fonte Anton/);
});
