import test from 'node:test';
import assert from 'node:assert/strict';
import {readModuleSource} from './helpers/domain-source.mjs';
import {readOperationalCss} from './helpers/operational-source.mjs';
test('Hortifruti picker presents one product per row at desktop and mobile widths',async()=>{
const css=await readOperationalCss(new URL('../interno/hortifruti/styles.css',import.meta.url));
assert.match(css,/\.hf-picker-list\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
const source=await readModuleSource('interno/hortifruti/product-picker.js');
assert.match(source,/type="checkbox"/);assert.match(source,/hf-pick-product/);
});
