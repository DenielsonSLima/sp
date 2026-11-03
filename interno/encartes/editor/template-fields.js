import { isTemplateDesign } from './presentation.js';

export function isAutomaticModelField(design, element) {
  return isTemplateDesign(design) && /^slot-\d+-(foto|nome|preco|unidade)$/.test(element?.id || '');
}

export function isEmptyModelPhoto(design, element) {
  return isTemplateDesign(design) && element.type === 'image' && !element.src && /^slot-\d+-foto$/.test(element.id);
}

export function drawModelPhotoPlaceholder(ctx, element) {
  const { width, height } = element;
  ctx.fillStyle = '#f1f4f7';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#7b8796';
  ctx.font = `600 ${Math.max(10, Math.min(24, width / 11, height / 7))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Foto do produto', width / 2, height / 2, width * 0.9);
}
