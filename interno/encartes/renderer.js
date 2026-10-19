import {FONT_FAMILIES} from './model.js';

/** Canvas-only artwork. Editor controls must remain in a separate overlay. */
const imageCache = new Map();
const FONTS = new Set(FONT_FAMILIES);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16000000;

export function validateCanvasSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error('O tamanho deve usar pixels inteiros, até 4096 por lado e 16 milhões de pixels no total.');
  }
}

function safeImageSource(src) {
  if (typeof src !== 'string') throw new Error('Imagem inválida.');
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z\d+/=\s]+$/i.test(src)) return src;
  if (src === './assets/logo-original.jpg') return src;
  throw new Error('Use uma imagem enviada do computador ou o logotipo original da loja.');
}

function loadImage(src) {
  const safe = safeImageSource(src);
  if (!imageCache.has(safe)) {
    const promise = new Promise((resolve, reject) => {
      if (typeof Image === 'undefined') return reject(new Error('Este ambiente não oferece carregamento de imagens.'));
      const img = new Image();
      const timeout = setTimeout(() => reject(new Error('A imagem demorou demais para carregar. Tente enviá-la novamente.')), 15000);
      img.onload = () => {
        clearTimeout(timeout);
        if (!(img.naturalWidth || img.width) || !(img.naturalHeight || img.height)) reject(new Error('A imagem está vazia.'));
        else resolve(img);
      };
      img.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível carregar uma imagem do encarte. Envie-a novamente.')); };
      img.src = safe;
    });
    imageCache.set(safe, promise);
    promise.catch(() => imageCache.delete(safe));
  }
  return imageCache.get(safe);
}

function font(size, family, weight = 'normal') {
  const safeFamily = FONTS.has(family) ? family : 'Arial';
  const fallback = ['Georgia', 'serif'].includes(safeFamily) ? 'serif' : safeFamily === 'Courier New' ? 'monospace' : 'sans-serif';
  const familyList = ['sans-serif', 'serif', 'monospace'].includes(safeFamily) ? safeFamily : `"${safeFamily}", ${fallback}`;
  return `${weight === 'bold' ? '700' : [400,500,600,700,800,900].includes(Number(weight)) ? Number(weight) : '400'} ${size}px ${familyList}`;
}

function fitLine(ctx, value, width) {
  let text = value;
  if (ctx.measureText(text).width <= width) return text;
  while (text.length && ctx.measureText(`${text}…`).width > width) text = Array.from(text).slice(0, -1).join('');
  return text ? `${text}…` : '';
}

/** Wrap at words; split very long words and preserve intentional line breaks. */
export function wrapText(ctx, value, width) {
  if (width <= 0) return [];
  const lines = [];
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { lines.push(line); line = ''; }
      let rest = word;
      while (ctx.measureText(rest).width > width && Array.from(rest).length > 1) {
        let part = '';
        for (const char of Array.from(rest)) {
          if (part && ctx.measureText(part + char).width > width) break;
          part += char;
        }
        if (line) { lines.push(line); line = ''; }
        lines.push(part);
        rest = rest.slice(part.length);
      }
      line = line ? `${line} ${rest}` : rest;
    }
    lines.push(line);
  }
  return lines;
}

function textBlock(ctx, text, x, y, width, height, opts = {}) {
  const size = Math.max(1, Number(opts.size) || 24);
  const lineHeight = size * 1.2;
  ctx.font = font(size, opts.family, opts.weight);
  ctx.fillStyle = opts.color || '#171717';
  ctx.textBaseline = 'top';
  ctx.textAlign = ['left', 'center', 'right'].includes(opts.align) ? opts.align : 'left';
  const lines = wrapText(ctx, text, width);
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] = fitLine(ctx, `${visible.at(-1)}…`, width);
  const tx = x + (ctx.textAlign === 'center' ? width / 2 : ctx.textAlign === 'right' ? width : 0);
  visible.forEach((line, i) => ctx.fillText(line, tx, y + i * lineHeight));
}

function containedImage(ctx, img, x, y, width, height, cropLogo = false) {
  if (width <= 0 || height <= 0) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (cropLogo) {
    // Crop only the known bundled artwork; the original asset remains intact.
    const sx = iw * .11, sy = ih * .38, sw = iw * .75, sh = ih * .3;
    const ratio = Math.min(width / sw, height / sh);
    ctx.drawImage(img, sx, sy, sw, sh, x + (width - sw * ratio) / 2, y + (height - sh * ratio) / 2, sw * ratio, sh * ratio);
    return;
  }
  const ratio = Math.min(width / iw, height / ih);
  ctx.drawImage(img, x + (width - iw * ratio) / 2, y + (height - ih * ratio) / 2, iw * ratio, ih * ratio);
}

function product(ctx, element, img) {
  const {width: w, height: h} = element;
  ctx.fillStyle = element.background || '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const pad = Math.max(4, Math.min(w, h) * .055);
  const innerWidth = Math.max(1, w - pad * 2);
  const nameSize = Math.max(8, Math.min(28, w * .09, h * .085));
  const nameHeight = nameSize * 2.4;
  const priceHeight = Math.max(12, Math.min(h * .25, w * .28));
  const unitSize = Math.max(7, Math.min(17, w * .055, h * .055));
  const unitHeight = element.unit ? unitSize * 1.2 : 0;
  const priceY = h - pad - unitHeight - priceHeight;
  const nameY = Math.max(pad, priceY - nameHeight - pad * .6);
  const photoHeight = nameY - pad * 1.6;
  if (img) containedImage(ctx, img, pad, pad, innerWidth, photoHeight, element.image === './assets/logo-original.jpg');
  textBlock(ctx, element.name, pad, nameY, innerWidth, nameHeight, {size: nameSize, family: element.fontFamily, weight: 'bold', color: element.textColor, align: 'center'});
  let priceSize = priceHeight * .8;
  ctx.font = font(priceSize, element.fontFamily, 'bold');
  while (priceSize > 5 && ctx.measureText(element.priceText || '').width > innerWidth) {
    priceSize -= .5;
    ctx.font = font(priceSize, element.fontFamily, 'bold');
  }
  textBlock(ctx, element.priceText, pad, priceY, innerWidth, priceHeight, {size: priceSize, family: element.fontFamily, weight: 'bold', color: element.priceColor || '#c51624', align: 'center'});
  if (element.unit) textBlock(ctx, element.unit, pad, h - pad - unitHeight, innerWidth, unitHeight + 1, {size: unitSize, family: element.fontFamily, color: element.textColor, align: 'center'});
}

export async function renderDesign(canvas, design, {scale = 1} = {}) {
  if (!design || !Array.isArray(design.elements)) throw new Error('Encarte inválido.');
  validateCanvasSize(design.width, design.height);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Escala de visualização inválida.');
  const width = Math.max(1, Math.round(design.width * scale));
  const height = Math.max(1, Math.round(design.height * scale));
  validateCanvasSize(width, height);
  for (const element of design.elements) {
    if (!['text', 'product', 'image', 'shape'].includes(element.type) ||
        !['x', 'y', 'width', 'height'].every(key => Number.isFinite(element[key])) || element.width <= 0 || element.height <= 0) {
      throw new Error('Um elemento do encarte tem tipo ou dimensões inválidos.');
    }
    if (element.type === 'image' && !element.src) throw new Error('Selecione uma imagem para o elemento de foto.');
  }
  if (globalThis.document?.fonts?.ready) await document.fonts.ready;
  const loaded = await Promise.all(design.elements.map(element => {
    const src = element.type === 'image' ? element.src : element.type === 'product' ? element.image : '';
    return src ? loadImage(src) : null;
  }));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível iniciar a área de desenho.');
  ctx.scale(width / design.width, height / design.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = design.bgColor || '#ffffff';
  ctx.fillRect(0, 0, design.width, design.height);
  design.elements.forEach((element, index) => {
    ctx.save();
    ctx.translate(element.x, element.y);
    ctx.beginPath();
    ctx.rect(0, 0, element.width, element.height);
    ctx.clip();
    if (element.type === 'shape') { ctx.fillStyle = element.fill || '#e31b23'; ctx.fillRect(0, 0, element.width, element.height); }
    if (element.type === 'image') containedImage(ctx, loaded[index], 0, 0, element.width, element.height, element.src === './assets/logo-original.jpg');
    if (element.type === 'text') textBlock(ctx, element.text, 0, 0, element.width, element.height, {size: element.fontSize, family: element.fontFamily, weight: element.fontWeight, color: element.color, align: element.align});
    if (element.type === 'product') product(ctx, element, loaded[index]);
    ctx.restore();
  });
  return canvas;
}
