import test from 'node:test';
import assert from 'node:assert/strict';
import { compactFlyerWrite, confirmsFlyerWrite } from '../shared/data/flyer-write.js';
const image = 'data:image/png;base64,' + 'ABCD'.repeat(1_025_000);
const old = { id: 'a', _version: 5, elements: [{ id: 'photo', src: image }, { id: 'text', text: '3,49' }] };
test('price-only changes retain exact image references and remove megabytes from the wire', () => {
  const next = structuredClone(old); next.elements[1].text = '6,90';
  const payload = compactFlyerWrite(next, old, 5);
  assert.deepEqual(payload.imageRefs, [{ target: 0, field: 'src', source: 0, sourceField: 'src' }]);
  assert.equal(payload.record.elements[0].src, undefined);
  assert.equal(next.elements[0].src, image);
  assert.ok(JSON.stringify(payload).length < 300);
});
test('reordered and duplicated images resolve from the confirmed source position', () => {
  const next = { ...old, elements: [old.elements[1], old.elements[0], { id: 'copy', image }] };
  const payload = compactFlyerWrite(next, old, 5);
  assert.deepEqual(payload.imageRefs.map(r => [r.target, r.field, r.source]), [[1, 'src', 0], [2, 'image', 0]]);
});
test('first save, another document or mismatched revision always carries full images', () => {
  for (const previous of [undefined, { ...old, id: 'b' }, { ...old, _version: 6 }]) {
    const payload = compactFlyerWrite(old, previous, 5);
    assert.equal(payload.record.elements[0].src, image); assert.deepEqual(payload.imageRefs, []);
  }
  const changed = { ...old, elements: [{ src: 'data:image/png;base64,NEW=' }] };
  assert.equal(compactFlyerWrite(changed, old, 5).imageRefs.length, 0);
});
test('lost acknowledgement is confirmed only by the next revision with identical content', () => {
  assert.equal(confirmsFlyerWrite(old, { elements: old.elements, id: 'a', _version: 6, updatedAt: 'server' }, 5), true);
  assert.equal(confirmsFlyerWrite(old, { ...old, _version: 7 }, 5), false);
  assert.equal(confirmsFlyerWrite(old, { ...old, _version: 6, title: 'Someone else' }, 5), false);
});
