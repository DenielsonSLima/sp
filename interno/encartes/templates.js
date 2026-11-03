import { listRecords } from '../../shared/data/api.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { newId, validateDesign } from './model.js';

export const templates = [];
export async function loadFlyerTemplates() {
  const rows = await listRecords('flyer_templates');
  for (const row of rows) {
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || !row.definition)
      throw Error('O banco retornou um modelo de encarte incompleto.');
    validateDesign(row.definition);
  }
  templates.splice(0, templates.length, ...rows);
  return templates;
}

/** Geometry only: the stored definition supplies all content, colors and layout. */
export function applyTemplateDefinition(input, template) {
  if (!template?.definition) throw Error('O modelo não possui uma definição de arte válida no banco.');
  const design = validateDesign(input),
    source = validateDesign(template.definition);
  const scaleX = design.width / source.width,
    scaleY = design.height / source.height,
    scaleText = Math.min(scaleX, scaleY);
  const actual = design.elements.filter((element) => element.type === 'product' && !element.placeholder);
  const custom = design.elements.filter(
    (element) => element.type !== 'product' && !element.templatePart && !element.linkedProductId,
  );
  const ids = new Map(source.elements.map((element) => [element.id, newId()]));
  let productIndex = 0;
  const elements = source.elements.map((element) => {
    const next = {
      ...structuredClone(element),
      id: ids.get(element.id),
      x: element.x * scaleX,
      y: element.y * scaleY,
      width: element.width * scaleX,
      height: element.height * scaleY,
    };
    if (element.fontSize !== undefined) next.fontSize = element.fontSize * scaleText;
    if (element.strokeWidth !== undefined) next.strokeWidth = element.strokeWidth * scaleText;
    if (element.radius !== undefined) next.radius = element.radius * scaleText;
    if (element.linkedProductId) next.linkedProductId = ids.get(element.linkedProductId);
    if (element.type === 'product') {
      const current = actual[productIndex++];
      if (current) {
        for (const key of ['name', 'image', 'unit', 'priceText', 'priceCents', 'placeholder']) {
          if (Object.hasOwn(current, key)) next[key] = current[key];
        }
        next.placeholder = false;
      }
    }
    return next;
  });
  for (const element of elements) {
    if (!element.linkedProductId) continue;
    const product = elements.find((item) => item.id === element.linkedProductId);
    if (product)
      element.text =
        element.linkedField === 'name'
          ? product.name
          : element.linkedField === 'price'
            ? product.priceText || 'R$ —,—'
            : product.unit;
  }
  // Preserve additional user products and custom elements rather than discarding them.
  return validateDesign({
    ...design,
    title: design.title === 'Nova arte' ? template.name : design.title,
    bgColor: source.bgColor,
    elements: [...elements, ...actual.slice(productIndex), ...custom],
    updatedAt: new Date().toISOString(),
  });
}
export function applyTemplate(input, id) {
  const template = templates.find((record) => record.id === id);
  if (!template) throw Error('Modelo de encarte não encontrado no banco. Atualize a galeria.');
  return applyTemplateDefinition(input, template);
}
clearOnContextChange('flyer_templates', () => {
  templates.length = 0;
});
