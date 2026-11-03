import { attachCurrencyInput } from '../../../shared/components/currency-input/index.js';

// The mask emits canonical input immediately, before the inspector updates the artwork.
export function bindOfferPriceInput(input, onInput) {
  attachCurrencyInput(input, { maxCents: Number.MAX_SAFE_INTEGER });
  let previous = input.value;
  input.addEventListener('input', event => {
    if (event.isComposing || input.getAttribute('aria-invalid') === 'true' || input.value === previous) return;
    previous = input.value;
    onInput();
  });
}
