// Presentation only: complete decimal digits without changing the supplied amount.
export function formatOfferPrice(value) {
  const raw = String(value ?? '').trim().replace(/^R\$\s*/i, '');
  if (!raw) return '';
  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{0,2}))?$/.exec(raw);
  const decimal = grouped || /^(\d+)(?:[,.](\d{0,2}))?$/.exec(raw) || /^(\d*)[,.](\d{1,2})$/.exec(raw);
  if (!decimal) return raw;
  const integer = (decimal[1].replace(/\./g, '') || '0').replace(/^0+(?=\d)/, '');
  return `${integer},${(decimal[2] || '').padEnd(2, '0')}`;
}
