const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Visual adjustments preserve the layer id used by reusable model slots. */
export function quickAdjustment(element, action, design) {
  if (!element || element.locked) return null;
  if (action === 'font-smaller' || action === 'font-larger') {
    if (element.type !== 'text' || element.priceBadge) return null;
    return { fontSize: clamp(element.fontSize + (action === 'font-larger' ? 2 : -2), 8, 600) };
  }
  if (!['image-smaller', 'image-larger'].includes(action) || !['image', 'product'].includes(element.type))
    return null;
  const requested = action === 'image-larger' ? 1.1 : 1 / 1.1;
  const factor = clamp(requested, Math.max(1 / element.width, 1 / element.height),
    Math.min(design.width / element.width, design.height / element.height));
  const width = element.width * factor, height = element.height * factor;
  return {
    width, height,
    x: clamp(element.x + (element.width - width) / 2, 0, design.width - width),
    y: clamp(element.y + (element.height - height) / 2, 0, design.height - height),
  };
}

export function quickAdjustmentsMarkup(element) {
  const disabled = element.locked ? 'disabled' : '';
  if (element.type === 'text' && !element.priceBadge)
    return `<div class="flyer-quick-adjustments" role="group" aria-label="Tamanho da fonte"><button type="button" class="button secondary" data-quick-adjust="font-smaller" ${disabled} aria-label="Diminuir fonte">A− <span>Diminuir</span></button><button type="button" class="button secondary" data-quick-adjust="font-larger" ${disabled} aria-label="Aumentar fonte">A+ <span>Aumentar</span></button></div>`;
  if (['image', 'product'].includes(element.type))
    return `<div class="flyer-quick-adjustments" role="group" aria-label="Tamanho da imagem"><button type="button" class="button secondary" data-quick-adjust="image-smaller" ${disabled} aria-label="Diminuir imagem">− <span>Diminuir foto</span></button><button type="button" class="button secondary" data-quick-adjust="image-larger" ${disabled} aria-label="Aumentar imagem">+ <span>Aumentar foto</span></button></div>`;
  return '';
}

export function modelSlotDescription(element) {
  const slot = /^slot-(\d+)-(foto|nome|preco|unidade|cartao|borda)$/.exec(element.id);
  if (!slot) return '';
  const field = { foto: 'Foto', nome: 'Nome', preco: 'Preço', unidade: 'Unidade', cartao: 'Fundo', borda: 'Borda' }[slot[2]];
  return `${field} do produto ${slot[1]}`;
}
