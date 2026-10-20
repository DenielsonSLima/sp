import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Hortifruti picker presents one product per row at desktop and mobile widths',()=>{
const css=readFileSync(new URL('../interno/hortifruti/styles.css',import.meta.url),'utf8');
assert.match(css,/\.hf-picker-list\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
const source=readFileSync(new URL('../interno/hortifruti/product-picker.js',import.meta.url),'utf8');
assert.match(source,/type="checkbox"/);assert.match(source,/hf-pick-product/);
});
