import { attachCurrencyInput, currencyDecimal } from '../../shared/components/currency-input/index.js';

// Preserve the range already accepted by the quotation RPC, independently of promotions.
export const MAX_OFFER_CENTS = 100000000;

export function attachOfferInput(input, { savedValue = input.value, save, onDraft, onSaving, onSaved, onError }) {
  attachCurrencyInput(input, { maxCents: MAX_OFFER_CENTS });
  let persisted = savedValue;
  let saving = false;
  let queued;
  let pending;

  input.oninput = () => onDraft(input.value);
  const commit = () => {
    if (!input.checkValidity()) {
      onError(new Error(input.validationMessage));
      return pending;
    }
    if (!saving && input.value === persisted) {
      onSaved(input.value);
      return pending;
    }
    queued = input.value;
    if (saving) return pending;
    saving = true;
    pending = (async () => {
      try {
        while (queued !== undefined) {
          const value = queued;
          queued = undefined;
          if (value === persisted) continue;
          onSaving();
          try {
            await save(currencyDecimal(value, MAX_OFFER_CENTS));
            persisted = value;
            onSaved(value);
          } catch (error) {
            onError(error);
          }
        }
      } finally {
        saving = false;
      }
    })();
    return pending;
  };
  input.onblur = commit;
  input.form.onsubmit = (event) => {
    event.preventDefault();
    return commit();
  };
}
