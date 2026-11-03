export const MAX_CENTS = 999999;
const limitMessage = (maxCents) =>
  `Use um valor de até R$ ${(maxCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
export function formatBRLCents(cents, maxCents = MAX_CENTS) {
  if (cents === null) return '';
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > maxCents) throw Error(limitMessage(maxCents));
  return `${String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(cents % 100).padStart(2, '0')}`;
}
export function parseBRLCents(input, maxCents = MAX_CENTS) {
  let value = String(input ?? '')
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
  if (!value) return null;
  let whole,
    fraction = '';
  if (value.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value))
      throw Error('Informe um valor em reais com até duas casas decimais.');
    [whole, fraction] = value.split(',');
    whole = whole.replace(/\./g, '');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    whole = value.replace(/\./g, '');
  } else if (/^\d+(?:\.\d{1,2})?$/.test(value)) {
    [whole, fraction = ''] = value.split('.');
  } else throw Error('Informe um valor em reais válido.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > maxCents) throw Error(limitMessage(maxCents));
  return cents;
}
export function currencyDecimal(input, maxCents = MAX_CENTS) {
  const cents = parseBRLCents(input, maxCents);
  return cents === null ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
const digits = (value) => (value.match(/\d/g) || []).join('');
function caretFor(value, canonical, index) {
  const padding = digits(value).length - canonical.length,
    target = index + padding;
  if (target <= 0) return 0;
  let count = 0;
  for (let i = 0; i < value.length; i++) if (/\d/.test(value[i]) && ++count === target) return i + 1;
  return value.length;
}
export function editCurrency({
  value = '',
  start = value.length,
  end = start,
  inputType = 'insertText',
  data = '',
  maxCents = MAX_CENTS,
}) {
  let cents;
  try {
    cents = parseBRLCents(value, maxCents);
  } catch {
    cents = null;
  }
  const canonical = cents === null ? '' : String(cents);
  const padding = Math.max(0, digits(value).length - canonical.length);
  let from = Math.max(0, Math.min(canonical.length, digits(value.slice(0, start)).length - padding)),
    to = Math.max(from, Math.min(canonical.length, digits(value.slice(0, end)).length - padding));
  let insert = '';
  if (inputType.startsWith('delete')) {
    if (from === to) {
      if (inputType === 'deleteContentForward') to = Math.min(canonical.length, to + 1);
      else from = Math.max(0, from - 1);
    }
  } else {
    const raw = inputType === 'insertFromPaste' ? String(data ?? '').replace(/\s/g, '') : String(data ?? '');
    if (!raw) return { value, caret: start, cents };
    if (inputType === 'insertFromPaste' && /[R$.,]/i.test(raw)) {
      try {
        const parsed = parseBRLCents(raw, maxCents);
        insert = parsed === null ? '' : String(parsed);
      } catch (error) {
        return { value, caret: start, cents, error: error.message };
      }
    } else {
      if (!/^\d+$/.test(raw)) return { value, caret: start, cents };
      insert = raw;
    }
  }
  const combined = canonical.slice(0, from) + insert + canonical.slice(to),
    trimmed = combined.replace(/^0+(?=\d)/, ''),
    removed = combined.length - trimmed.length,
    nextCents = trimmed === '' ? null : Number(trimmed);
  if (nextCents !== null && (!Number.isSafeInteger(nextCents) || nextCents > maxCents))
    return { value, caret: start, cents, error: limitMessage(maxCents) };
  const formatted = formatBRLCents(nextCents, maxCents),
    index = Math.max(0, from + insert.length - removed);
  return {
    value: formatted,
    caret: nextCents === null ? 0 : caretFor(formatted, String(nextCents), index),
    cents: nextCents,
  };
}
const attached = new WeakSet();
export function attachCurrencyInput(input, { maxCents = MAX_CENTS } = {}) {
  if (attached.has(input)) return;
  attached.add(input);
  input.inputMode = 'decimal';
  input.removeAttribute('maxlength');
  let dispatching = false,
    pendingNative = null,
    focusValue = input.value,
    lastChange = input.value;
  const valid = (message) => {
    input.setCustomValidity(message || '');
    input.setAttribute('aria-invalid', String(!!message));
  };
  try {
    if (input.value) input.value = formatBRLCents(parseBRLCents(input.value, maxCents), maxCents);
    valid('');
  } catch (error) {
    valid(error.message);
  }
  const notify = () => {
    dispatching = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dispatching = false;
  };
  const apply = (type, data) => {
    const result = editCurrency({
      value: input.value,
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
      inputType: type,
      data,
      maxCents,
    });
    valid(result.error);
    if (result.error) return;
    input.value = result.value;
    input.setSelectionRange(result.caret, result.caret);
    notify();
  };
  input.addEventListener('focus', () => {
    focusValue = input.value;
    lastChange = input.value;
  });
  input.addEventListener('change', () => {
    lastChange = input.value;
  });
  input.addEventListener('blur', () => {
    if (input.value !== focusValue && input.value !== lastChange)
      input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  input.addEventListener('beforeinput', (event) => {
    if (event.isComposing) return;
    if (!event.cancelable) {
      if (event.inputType.startsWith('delete') || event.inputType === 'insertText')
        pendingNative = editCurrency({
          value: input.value,
          start: input.selectionStart ?? input.value.length,
          end: input.selectionEnd ?? input.value.length,
          inputType: event.inputType,
          data: event.data,
          maxCents,
        });
      return;
    }
    if (
      event.inputType.startsWith('delete') ||
      event.inputType === 'insertText' ||
      event.inputType === 'insertReplacementText'
    ) {
      event.preventDefault();
      apply(event.inputType, event.data);
    }
  });
  input.addEventListener('paste', (event) => {
    event.preventDefault();
    apply('insertFromPaste', event.clipboardData?.getData('text') || '');
  });
  input.addEventListener(
    'input',
    (event) => {
      if (dispatching || event.isComposing) return;
      if (pendingNative) {
        const result = pendingNative;
        pendingNative = null;
        input.value = result.value;
        input.setSelectionRange(result.caret, result.caret);
        valid(result.error);
        return;
      }
      const text = input.value;
      try {
        const amount = digits(text);
        if (/[a-z]/i.test(text.replace(/R\$/i, ''))) throw Error('Informe somente números.');
        input.value = formatBRLCents(amount ? Number(amount) : null, maxCents);
        input.setSelectionRange(input.value.length, input.value.length);
        valid('');
      } catch (error) {
        valid(error.message);
      }
    },
    { capture: true },
  );
}
