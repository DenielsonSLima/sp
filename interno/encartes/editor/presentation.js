export const tools = [
  ['text', 'Adicionar'],
  ['brand', 'Biblioteca'],
];
export const safeName = (value) =>
  (value || 'encarte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80);
