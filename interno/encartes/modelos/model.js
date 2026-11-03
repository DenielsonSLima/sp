import { createDesign, validateDesign, newId } from '../model.js';
import { FLYER_FORMATS, FLYER_TEMPLATES, flyerOption } from '../generator/options.js';
import { FLYER_MODEL_PRESETS, modelDecorations } from '../generator/model-presets.js';
import { box, pageHeader, productElements } from '../generator/layout.js';
import { storyHeader, storyProductElements } from '../generator/story-layout.js';

export { FLYER_MODEL_PRESETS } from '../generator/model-presets.js';

const requiredFields = Object.freeze({ foto: 'image', nome: 'text', preco: 'text', unidade: 'text' });
const slotPattern = /^slot-([1-9]\d*)-([a-z-]+)$/;

export function isFlyerModel(value) {
  const id = typeof value === 'string' ? value : value?.id;
  return typeof id === 'string' && /^modelo_[a-zA-Z0-9_-]{1,90}$/.test(id);
}

export function flyerModelSlots(design) {
  const slots = new Map();
  for (const element of design?.elements || []) {
    const match = slotPattern.exec(element.id || '');
    if (!match) continue;
    const number = Number(match[1]);
    if (!slots.has(number)) slots.set(number, new Map());
    if (slots.get(number).has(match[2])) throw Error(`O espaço ${number} tem campos repetidos.`);
    slots.get(number).set(match[2], element);
  }
  return [...slots.entries()].sort(([a], [b]) => a - b);
}

export function modelSlotCount(design) {
  return flyerModelSlots(design).length;
}

/** Slots bind content by stable IDs, so moving/resizing layers never loses the binding. */
export function validateFlyerModel(value) {
  if (!isFlyerModel(value)) throw Error('O arquivo precisa ser um modelo de encarte.');
  const slots = flyerModelSlots(value);
  if (!slots.length || slots.length > 24) throw Error('O modelo precisa ter de 1 a 24 espaços de produtos.');
  for (const [number, fields] of slots) {
    for (const [field, type] of Object.entries(requiredFields)) {
      if (fields.get(field)?.type !== type)
        throw Error(`O espaço ${number} precisa dos campos de foto, nome, preço e unidade.`);
    }
  }
  const design = validateDesign(value);
  delete design.publication;
  design.status = 'created';
  return design;
}

export function createBlankFlyerModel({
  presetId = 'povo', templateId = 'grid-8', formatId = 'story', title, headerAsset,
  logo = './assets/logo-original.jpg', storeName = 'Supermercado do Povo',
} = {}) {
  const preset = flyerOption(FLYER_MODEL_PRESETS, presetId, 'modelo');
  const template = flyerOption(FLYER_TEMPLATES, templateId, 'modelo');
  const format = flyerOption(FLYER_FORMATS, formatId, 'formato');
  const design = createDesign({ width: format.width, height: format.height, title: title?.trim() || preset.name });
  design.id = `modelo_${newId()}`;
  design.bgColor = preset.background;
  design.status = 'created';
  const u = design.width / 1080, margin = 34 * u, gap = 18 * u;
  const festive = preset.layout ? storyHeader(design, preset,
    { logo, storeName, headerAsset: headerAsset ?? preset.headerAsset ?? '' }) : null;
  const headerHeight = festive?.headerHeight || 175 * u;
  const top = headerHeight + 26 * u, bottom = design.height - 88 * u;
  const rows = Math.ceil(template.perPage / template.columns);
  const width = (design.width - margin * 2 - gap * (template.columns - 1)) / template.columns;
  const height = (bottom - top - gap * (rows - 1)) / rows;
  design.elements = festive?.elements || pageHeader(design, { name: 'Título da promoção' }, preset, margin, headerHeight,
    { logo, storeName }, 'Validade da promoção', 0, 1);
  if (!festive) design.elements.splice(3, 0, ...modelDecorations(preset, design.width, design.height));
  for (let index = 0; index < template.perPage; index++) {
    const placement = box(margin + index % template.columns * (width + gap),
      top + Math.floor(index / template.columns) * (height + gap), width, height);
    design.elements.push(...(festive ? storyProductElements(index, placement, preset)
      : productElements({ name: '', displayName: 'Nome do produto', priceText: 'Preço' },
        index, placement, preset, '', { blank: true })));
  }
  return validateFlyerModel(design);
}

export function duplicateFlyerModel(value) {
  const design = validateFlyerModel(value), now = new Date().toISOString();
  return validateFlyerModel({ ...design, id: `modelo_${newId()}`,
    title: `${design.title.slice(0, 150)} (cópia)`, createdAt: now, updatedAt: now });
}
