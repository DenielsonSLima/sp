export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T12:00:00Z')) &&
  new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export const money = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function parseQuantity(value) {
  const s = String(value).trim();
  if (!/^\d+(?:[,.]\d{1,3})?$/.test(s)) throw new Error('Use uma quantidade positiva com até três casas decimais.');
  const number = Number(s.replace(',', '.'));
  if (number <= 0 || number > 1000000) throw new Error('Quantidade deve ser maior que zero e até 1.000.000.');
  return number;
}
