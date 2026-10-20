import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('compact module spacing keeps 44px targets and only changes vertical rhythm',()=>{
 const css=readFileSync(new URL('../interno/shell.css',import.meta.url),'utf8').split('/* Slightly denser module rhythm;')[1];
 assert.match(css,/min-height:44px/);
 assert.match(css,/margin-top:4\.5px/);
 assert.match(css,/padding-top:10\.8px/);
 assert.doesNotMatch(css,/font-size|background|brand-logo|[;{]width:/);
});
