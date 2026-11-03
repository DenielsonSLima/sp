import { createDesign, cloneDesignState, validateDesign } from '../model.js';
import { validateFlyerModel, flyerModelSlots } from '../modelos/model.js';

const slotPattern = /^slot-([1-9]\d*)-([a-z-]+)$/;
const bindings = { nome: 'name', preco: 'price', unidade: 'unit' };

/** Reuse the exact edited geometry and styles, replacing only bound content. */
export function fillFlyerModel(value, campaign, items, { photos, validity }) {
  const model = validateFlyerModel(value), slots = flyerModelSlots(model), perPage = slots.length;
  const totalPages = Math.ceil(items.length / perPage);
  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const pageItems = items.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    const assignments = new Map(slots.map(([number], index) => [number, pageItems[index]]));
    const page = createDesign({ width: model.width, height: model.height,
      title: `${campaign.name.slice(0, 128)} · Página ${pageIndex + 1} de ${totalPages}` });
    page.bgColor = model.bgColor;
    if (model.guides) page.guides = cloneDesignState(model.guides);
    page.elements = model.elements.flatMap((original) => {
      const element = cloneDesignState(original), match = slotPattern.exec(element.id);
      if (!match) {
        if (element.id === 'nome-da-promocao' && element.type === 'text') element.text = campaign.name;
        if (element.id === 'validade-da-promocao' && element.type === 'text') element.text = validity;
        if (element.id === 'numero-da-pagina' && element.type === 'text') element.text = `${pageIndex + 1} / ${totalPages}`;
        return [element];
      }
      const item = assignments.get(Number(match[1])), field = match[2];
      if (!item) return [];
      if (field === 'foto') {
        const photo = photos instanceof Map ? photos.get(item.productId) : photos?.[item.productId];
        if (!photo) return [{
          ...element, type: 'text', text: 'Imagem não cadastrada', label: `Foto: ${item.name}`,
          fontFamily: 'Arial', fontSize: Math.min(24, element.width * .055), fontWeight: 400,
          color: '#737373', align: 'center', autoFit: true,
        }];
        element.src = photo;
        element.label = `Foto: ${item.name}`;
      } else if (bindings[field]) {
        element.offerProductId = item.productId;
        element.offerField = bindings[field];
        element.text = field === 'nome' ? item.displayName : field === 'preco' ? item.priceText : `por ${item.unit}`;
      }
      return [element];
    });
    return validateDesign(page);
  });
}
