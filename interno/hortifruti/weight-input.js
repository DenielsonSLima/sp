import { decimal } from './model.js';
import { formatWeightHundredths } from '../../shared/components/weight-input.js';
export { MAX_WEIGHT_HUNDREDTHS, formatWeightHundredths, parseWeightHundredths, weightDecimal, editWeight, attachWeightInput } from '../../shared/components/weight-input.js';

export function formatWeightMicros(micros) {
  if (micros == null) return '';
  if (!Number.isSafeInteger(micros) || micros < 0) throw Error('Peso inválido.');
  return formatWeightHundredths(Number((BigInt(micros) + 5000n) / 10000n));
}
export function weightInputDisplay(raw) {
  if (!String(raw ?? '').trim()) return '';
  try {
    return formatWeightMicros(decimal(raw, 6, 'Peso líquido'));
  } catch {
    return String(raw);
  }
}
