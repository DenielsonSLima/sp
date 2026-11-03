import { escapeHtml as esc } from '../../../shared/ui.js';
export { esc };
export const modelSpeciesLabel = (model) => model.species === 'bovine' ? 'Bovino padrão' : model.category;
export const species = [
  ['bovine', 'Bovino — boi / vaca'],
  ['swine', 'Suíno — porco / porca'],
  ['caprine', 'Caprino — bode / cabra'],
  ['ovine', 'Ovino — carneiro / ovelha'],
  ['poultry', 'Aves — galo / galinha'],
];
export const modelHref = (id = '') => `#cadastros/acougue${id ? '/' + encodeURIComponent(id) : ''}`;
export const modelIdFromHash = (hash) => {
  try { return decodeURIComponent(hash.split('/')[2] || ''); } catch { return ''; }
};
export const chrome = () => '<link rel="stylesheet" href="./interno/cadastros/acougue/styles.css">';
export const partInput = (part) => ({
  ...part,
  percent: part.percent ?? (part.percentBps == null ? '' : String(part.percentBps / 100).replace('.', ',')),
  quantityPerAnimal: part.quantityPerAnimal ?? '',
});
