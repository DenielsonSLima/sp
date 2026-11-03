/** Presentation choices only; offer values always come from the saved campaign. */
export const FLYER_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'grid-6', name: '6 produtos por página', perPage: 6, columns: 2 }),
  Object.freeze({ id: 'grid-8', name: '8 produtos por página', perPage: 8, columns: 2 }),
  Object.freeze({ id: 'grid-9', name: '9 produtos por página', perPage: 9, columns: 3 }),
  Object.freeze({ id: 'grid-12', name: '12 produtos por página', perPage: 12, columns: 3 }),
]);

export const FLYER_FORMATS = Object.freeze([
  Object.freeze({ id: 'portrait', name: 'Feed · 1080 × 1350', width: 1080, height: 1350 }),
  Object.freeze({ id: 'story', name: 'Story · 1080 × 1920', width: 1080, height: 1920 }),
  Object.freeze({ id: 'a4', name: 'A4 · retrato', width: 1240, height: 1754 }),
]);

export const FLYER_THEMES = Object.freeze([
  Object.freeze({
    id: 'povo', name: 'Ofertas do Povo', primary: '#bd1427', accent: '#ffe54f',
    background: '#fff6de', ink: '#281c20', secondary: '#8a1020',
  }),
  Object.freeze({
    id: 'hortifruti', name: 'Hortifruti', primary: '#19613c', accent: '#e7ef88',
    background: '#f0f6e8', ink: '#183727', secondary: '#105237',
  }),
  Object.freeze({
    id: 'natal', name: 'Natal', primary: '#8f1930', accent: '#f1d59a',
    background: '#fcf6e9', ink: '#34242a', secondary: '#185642',
  }),
]);

export function flyerOption(options, id, label) {
  const option = options.find((entry) => entry.id === id);
  if (!option) throw Error(`Selecione um ${label} disponível.`);
  return option;
}
