import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindOfferPriceInput } from '../interno/encartes/editor/price-input.js';
import { readOfferText } from '../interno/encartes/editor/offer-fields.js';
class Input extends EventTarget {
  constructor(value = '') { super(); this.value = value; this.selectionStart = this.selectionEnd = value.length; this.attrs = {}; }
  removeAttribute() {}
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key]; }
  setCustomValidity(value) { this.error = value; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
}
function edit(input, data, inputType = 'insertText', cancelable = true) {
  const event = new Event('beforeinput', { cancelable });
  Object.defineProperties(event, { inputType: { value: inputType }, data: { value: data } });
  input.dispatchEvent(event);
}
test('typing 458 formats both field and artwork immediately, without blur or change', () => {
  const input = new Input(), values = [];
  bindOfferPriceInput(input, () => values.push(readOfferText({ offerField: 'price' }, input.value)));
  for (const [digit, expected] of [['4', '0,04'], ['5', '0,45'], ['8', '4,58']]) {
    edit(input, digit); assert.equal(input.value, expected); assert.equal(values.at(-1), `R$ ${expected}`);
  }
  assert.deepEqual(values, ['R$ 0,04', 'R$ 0,45', 'R$ 4,58']);
  input.dispatchEvent(new Event('blur')); assert.equal(values.length, 3);
  input.setSelectionRange(0, input.value.length); edit(input, '', 'deleteContentBackward');
  assert.equal(input.value, ''); assert.equal(values.at(-1), 'R$ —,—');
});
test('mask preserves existing reais on attachment, handles replacement/paste and refuses invalid pasted text', () => {
  const input = new Input('459,00'), values = [];
  bindOfferPriceInput(input, () => values.push(input.value));
  assert.equal(input.value, '459,00'); assert.equal(values.length, 0);
  input.setSelectionRange(0, input.value.length); edit(input, '458'); assert.equal(input.value, '4,58');
  const paste = text => {
    input.setSelectionRange(0, input.value.length);
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } }); input.dispatchEvent(event);
  };
  paste('R$ 12,90'); assert.equal(values.at(-1), '12,90');
  paste('199'); assert.equal(values.at(-1), '1,99');
  const count = values.length; paste('abc'); assert.equal(values.length, count);
});
test('native noncancelable input and mobile fallback are formatted before the preview callback', () => {
  const input = new Input(), values = [];
  bindOfferPriceInput(input, () => values.push(input.value));
  edit(input, '4', 'insertText', false); input.value = '4'; input.dispatchEvent(new Event('input'));
  assert.equal(values.at(-1), '0,04');
  input.value = '458'; input.dispatchEvent(new Event('input')); assert.equal(values.at(-1), '4,58');
});
test('inspector wires monetary input updates to the live artwork instead of waiting for change', async () => {
  const source = await readFile(new URL('../interno/encartes/editor/properties.js', import.meta.url), 'utf8');
  assert.match(source, /input.name === 'text' && el.offerField === 'price'[\s\S]*?bindOfferPriceInput\(input, \(\) => applyProps\(form\)\)/);
});
