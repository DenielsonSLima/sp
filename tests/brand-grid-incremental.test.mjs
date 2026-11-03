import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAssetGrid } from '../interno/cadastros/biblioteca-marca/asset-grid.js';

function fixture(t) {
  const before = globalThis.document;
  class Card {
    dataset = {};
    set innerHTML(value) { this.html = value; this.image = { src: '' }; }
    replaceWith(next) {
      next.parent = this.parent;
      this.parent.children.splice(this.parent.children.indexOf(this), 1, next);
    }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  }
  globalThis.document = { createElement: () => new Card() };
  t.after(() => { globalThis.document = before; });
  return {
    children: [],
    querySelectorAll() { return [...this.children]; },
    querySelector() { return null; },
    append(node) {
      const previous = this.children.indexOf(node);
      if (previous >= 0) this.children.splice(previous, 1);
      node.parent = this;
      this.children.push(node);
    },
    set innerHTML(value) { this.html = value; this.children = []; },
  };
}
const asset = (id) => ({ id, name: `Logo ${id}`, category: 'Logos', width: 100, height: 40, _version: 1 });

test('removing one asset preserves other cards and their already loaded images', (t) => {
  const grid = fixture(t), a = asset('a'), b = asset('b'), c = asset('c');
  reconcileAssetGrid(grid, [a, b, c]);
  const [first, removed, last] = grid.children;
  first.image.src = 'loaded-a';
  last.image.src = 'loaded-c';
  reconcileAssetGrid(grid, [a, c]);
  assert.deepEqual(grid.children, [first, last]);
  assert.equal(first.image.src, 'loaded-a');
  assert.equal(last.image.src, 'loaded-c');
  assert.equal(grid.children.includes(removed), false);
  reconcileAssetGrid(grid, [a, b, c]);
  assert.equal(grid.children[0], first);
  assert.equal(grid.children[2], last);
});

test('a metadata change replaces just its card and escapes untrusted labels', (t) => {
  const grid = fixture(t), a = asset('a'), b = asset('b');
  reconcileAssetGrid(grid, [a, b]);
  const [first, second] = grid.children;
  reconcileAssetGrid(grid, [{ ...a, _version: 2, name: '<script>bad</script>', category: '<img src=x>' }, b]);
  assert.notEqual(grid.children[0], first);
  assert.equal(grid.children[1], second);
  assert.match(grid.children[0].html, /&lt;script&gt;bad/);
  assert.match(grid.children[0].html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(grid.children[0].html, /<script>|<img src=x>/);
});
