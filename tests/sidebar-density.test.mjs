import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('compact desktop spacing preserves mobile touch targets and label styling',()=>{
 const css=readFileSync(new URL('../interno/shell.css',import.meta.url),'utf8').split('/* Slightly denser module rhythm;')[1];
 assert.match(css,/min-height:36px/);
 assert.match(css,/@media\(max-width:760px\).*min-height:44px/);
 assert.match(css,/margin-top:2px/);
 assert.match(css,/padding-top:7\.29px/);
 assert.doesNotMatch(css,/font-size|background|brand-logo|[;{]width:/);
});
