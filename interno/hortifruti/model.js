export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const validDate = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + 'T12:00:00Z')) &&
  new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
export const money = (cents) =>
  cents == null
    ? 'A conferir'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function formatDecimal(value, places = 6) {
  if (value == null) return '';
  return (value / 10 ** places)
    .toFixed(places)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}
export function decimal(value, places, label) {
  const s = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!s) return null;
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s))
    throw new Error(`${label}: use um número positivo com até ${places} casas decimais.`);
  const [whole, fraction = ''] = s.split('.');
  const scaled = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
  if (scaled <= 0n || scaled > 1000000n * 10n ** BigInt(places))
    throw new Error(`${label}: informe um valor maior que zero e até 1.000.000.`);
  return Number(scaled);
}
export const lineInput = (item) => ({
  productId: item.productId,
  unit: item.unit,
  unitCount: item.unitCount == null ? '' : String(item.unitCount),
  quantity: formatDecimal(item.quantityMicros),
  unitCost: formatDecimal(item.unitMicros),
  total: formatDecimal(item.totalCents, 2),
  basis: item.basis,
  weighMode: item.weighMode || 'total',
  boxes:
    item.weighMode === 'total' && item.inactiveBoxesRaw
      ? item.inactiveBoxesRaw.slice()
      : (item.boxes || []).map((v) => formatDecimal(v)),
  previousWeight:
    item.weighMode === 'total' && item.inactivePreviousWeightRaw !== undefined
      ? item.inactivePreviousWeightRaw
      : formatDecimal(item.previousWeightMicros),
});
export const summary = (record) => {
  if (!record?.computed?.summary) throw Error('O banco não retornou o resumo desta compra. Recarregue o registro.');
  return record.computed.summary;
};
