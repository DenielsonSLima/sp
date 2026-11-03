import { materializeProductPhoto } from '../cadastros/produtos/photo.js';
import { validateDesign } from './model.js';
import { syncProductTexts } from './layered-templates.js';

export async function replaceDesignProduct(
  design,
  elementId,
  product,
  { materialize = materializeProductPhoto, isCurrent = () => true } = {},
) {
  const photo = await materialize(product.photo || product.image || '');
  if (!isCurrent()) throw Error('A arte mudou durante o carregamento da foto. Selecione o produto novamente.');
  const next = structuredClone(design),
    item = next.elements.find((element) => element.id === elementId && element.type === 'product');
  if (!item || item.locked) throw Error('O elemento não está disponível para substituir o produto.');
  Object.assign(item, {
    name: product.name,
    image: photo,
    unit: product.unit === 'KG' ? 'kg' : 'un',
    placeholder: false,
    label: `Foto: ${product.name}`,
  });
  syncProductTexts(next, item);
  return validateDesign(next);
}
