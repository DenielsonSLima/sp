export const tools = [
  ['text', 'Adicionar'],
  ['brand', 'Biblioteca'],
];
export const isTemplateDesign = (design) => typeof design?.id === 'string' && design.id.startsWith('modelo_');
export const saveStateLabel = (text, design) => isTemplateDesign(design)
  ? text === 'Arte salva' ? 'Modelo salvo' : text === 'Nova arte' ? 'Novo modelo' : text
  : text;
export const safeName = (value) =>
  (value || 'encarte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80);
