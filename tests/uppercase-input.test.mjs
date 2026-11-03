import test from 'node:test';
import assert from 'node:assert/strict';
import { bindUppercaseInput } from '../shared/components/uppercase-input.js';
const field = (value) => {
  const listeners = {};
  return { value, selectionStart: 1, selectionEnd: 1, listeners,
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute() {},
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  };
};
test('catalog input uppercases accented names and pasted values without moving caret to end', () => {
  const input = field('açúcar'); bindUppercaseInput(input);
  assert.equal(input.value, 'AÇÚCAR'); assert.equal(input.selectionStart, 1);
  input.value = 'pão de queijo'; input.selectionStart = 3; input.selectionEnd = 6;
  input.listeners.input({ isComposing: false });
  assert.equal(input.value, 'PÃO DE QUEIJO');
  assert.equal(input.selectionStart, 3); assert.equal(input.selectionEnd, 6);
});
test('uppercase waits for IME composition and handles expanding Unicode characters', () => {
  const input = field(''); bindUppercaseInput(input);
  input.value = 'ßa'; input.listeners.input({ isComposing: true });
  assert.equal(input.value, 'ßa');
  input.listeners.compositionend();
  assert.equal(input.value, 'SSA'); assert.equal(input.selectionStart, 2);
});
