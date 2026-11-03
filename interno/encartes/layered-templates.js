import { validateDesign } from './model.js';
export function syncProductTexts(design, product) {
  for (const element of design.elements) {
    if (element.linkedProductId !== product.id) continue;
    element.text =
      element.linkedField === 'name'
        ? product.name
        : element.linkedField === 'price'
          ? product.priceText || 'R$ —,—'
          : product.unit;
  }
}

export function updateLinkedProductText(design, element) {
  const product = design.elements.find((item) => item.type === 'product' && item.id === element.linkedProductId);
  if (!product) return;
  if (element.linkedField === 'name') product.name = element.text.slice(0, 180);
  if (element.linkedField === 'unit') product.unit = element.text.slice(0, 40);
  if (element.linkedField === 'price') {
    product.priceText = element.text.slice(0, 40);
    delete product.priceCents;
  }
}

export function fillTemplateProducts(design, catalog, { preview = false, category = '' } = {}) {
  const next = structuredClone(design);
  const preferred = catalog.filter((p) => !category || p.category === category),
    pool = preferred.length ? preferred : catalog;
  next.elements
    .filter((e) => e.type === 'product' && e.placeholder)
    .forEach((element, index) => {
      const product = pool[index % pool.length];
      if (!product) return;
      Object.assign(element, {
        name: product.name,
        image: product.photo || product.image || '',
        unit: product.unit === 'KG' ? 'kg' : 'un',
        placeholder: false,
        priceText: product.priceText || 'R$ —,—',
      });
      delete element.priceCents;
      syncProductTexts(next, element);
    });
  return validateDesign(next);
}
