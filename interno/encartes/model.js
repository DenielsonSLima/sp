import { normalizePriceBadge } from './price-badge.js';
/** Flyer geometry and presentation validation. Persistence is provided by Supabase RPC. */
export const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Georgia', 'Trebuchet MS', 'Impact', 'sans-serif', 'serif'];
export const FONT_FAMILIES = FONTS;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_JSON_BYTES = 25 * 1024 * 1024;
// Canonical documents contain plain JSON. Copy their containers while reusing
// immutable image strings instead of serializing megabytes on every movement.
export function cloneDesignState(value) {
  if (Array.isArray(value)) return value.map(cloneDesignState);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDesignState(item)]));
  return value;
}
const clone = cloneDesignState;
function sameState(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameState(a[key], b[key]))
  );
}
export function newId() {
  return (
    globalThis.crypto?.randomUUID?.() || `flyer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  );
}
const string = (v, fallback, max) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const number = (v, fallback, label) => {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label}: número inválido.`);
  return v;
};
const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v) ? v : fallback);
const font = (v) => (FONTS.includes(v) ? v : 'Arial');
const id = (v) => (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : newId());
function imageSource(v) {
  if (v === '' || v == null) return '';
  if (
    v === './assets/logo-original.jpg' ||
    (typeof v === 'string' && /^\.\/assets\/encartes\/camadas\/[a-z0-9-]+\.png$/.test(v))
  )
    return v;
  if (typeof v !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(v))
    throw new Error('Imagem inválida. Use PNG, JPEG, WebP ou GIF local.');
  const payload = v.slice(v.indexOf(',') + 1);
  if (
    !payload.length ||
    payload.length % 4 !== 0 ||
    (payload.length * 3) / 4 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0) > MAX_IMAGE_BYTES
  )
    throw new Error('Cada imagem deve ter no máximo 8 MB e dados válidos.');
  return v;
}
export function createDesign({ width = 1080, height = 1080, title = 'Nova arte' } = {}) {
  const now = new Date().toISOString();
  return validateDesign({
    id: newId(),
    title,
    status: 'draft',
    width,
    height,
    bgColor: '#fff5d6',
    createdAt: now,
    updatedAt: now,
    elements: [],
  });
}
export function createTextElement(design) {
  return {
    id: newId(),
    type: 'text',
    x: design.width * 0.08,
    y: design.height * 0.08,
    width: design.width * 0.72,
    height: Math.min(design.height * 0.15, 140),
    locked: false,
    text: 'Digite seu texto',
    fontFamily: 'Arial',
    fontSize: Math.max(16, Math.round(design.width / 24)),
    fontWeight: 700,
    color: '#b91c1c',
    align: 'left',
  };
}
export function createProductElement(product = {}, design) {
  return {
    id: newId(),
    type: 'product',
    x: design.width * 0.1,
    y: design.height * 0.25,
    width: design.width * 0.4,
    height: design.height * 0.5,
    locked: false,
    name: string(product.name, 'Nome do produto', 180),
    placeholder: false,
    ...(Number.isSafeInteger(product.priceCents) && product.priceCents >= 0 ? { priceCents: product.priceCents } : {}),
    priceText:
      typeof product.priceText === 'string'
        ? product.priceText.slice(0, 40)
        : Number.isSafeInteger(product.priceCents) && product.priceCents >= 0
          ? (product.priceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '',
    unit: string(product.unit, 'un', 40),
    image: imageSource(product.photo || product.image || ''),
    background: '#ffffff',
    textColor: '#242424',
    priceColor: '#c5161d',
    fontFamily: 'Arial',
  };
}
export function duplicateElement(element) {
  return { ...clone(element), id: newId(), x: element.x + 20, y: element.y + 20, locked: false };
}
// Provenance of a rendered campaign page, not a source of business prices or access rights.
export function validatePublication(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'campaign')
    throw new Error('Origem do encarte inválida.');
  const result = { kind: 'campaign' };
  for (const key of ['groupId', 'campaignId', 'templateId', 'themeId', 'formatId']) {
    if (typeof value[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value[key]))
      throw new Error('Identificador da origem do encarte inválido.');
    result[key] = value[key];
  }
  if (!Number.isSafeInteger(value.campaignVersion) || value.campaignVersion < 1 ||
      !Number.isSafeInteger(value.pageCount) || value.pageCount < 1 || value.pageCount > 1000 ||
      !Number.isSafeInteger(value.pageIndex) || value.pageIndex < 0 || value.pageIndex >= value.pageCount)
    throw new Error('Página ou revisão da origem do encarte inválida.');
  return { ...result, campaignVersion: value.campaignVersion, pageIndex: value.pageIndex, pageCount: value.pageCount };
}
export function validateDesign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Arquivo de arte inválido.');
  const width = number(value.width, 1080, 'Largura'),
    height = number(value.height, 1080, 'Altura');
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    height < 320 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16000000
  )
    throw new Error('Dimensões permitidas: 320 a 4096 px, até 16 milhões de pixels.');
  if (!Array.isArray(value.elements) || value.elements.length > 200)
    throw new Error('A arte deve ter uma lista de até 200 elementos.');
  const now = new Date().toISOString();
  const date = (v) =>
    typeof v === 'string' && v.length < 40 && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : now;
  const seen = new Set();
  const elements = value.elements.map((e) => {
    if (!e || typeof e !== 'object' || !['text', 'product', 'image', 'shape'].includes(e.type))
      throw new Error('Tipo de elemento não suportado.');
    let elementId = id(e.id);
    if (seen.has(elementId)) elementId = newId();
    seen.add(elementId);
    const w = clamp(number(e.width, width * 0.3, 'Largura do elemento'), 1, width);
    const h = clamp(number(e.height, height * 0.2, 'Altura do elemento'), 1, height);
    const base = {
      id: elementId,
      type: e.type,
      x: clamp(number(e.x, 0, 'Posição X'), 0, width - w),
      y: clamp(number(e.y, 0, 'Posição Y'), 0, height - h),
      width: w,
      height: h,
      locked: e.locked === true,
      rotation: clamp(number(e.rotation, 0, 'Rotação'), -360, 360),
      flipX: e.flipX === true,
      flipY: e.flipY === true,
      opacity: clamp(number(e.opacity, 1, 'Opacidade'), 0, 1),
      hidden: e.hidden === true,
      label: string(e.label, '', 100),
      templatePart: e.templatePart === true,
    };
    if (e.type === 'text')
      return {
        ...base,
        text: string(e.text, '', 4000),
        fontFamily: font(e.fontFamily),
        fontSize: clamp(number(e.fontSize, 40, 'Tamanho da fonte'), 8, 600),
        fontWeight: [400, 500, 600, 700, 800, 900, 'normal', 'bold'].includes(e.fontWeight) ? e.fontWeight : 700,
        color: color(e.color, '#242424'),
        align: ['left', 'center', 'right'].includes(e.align) ? e.align : 'left',
        strokeColor: color(e.strokeColor, '#ffffff'),
        strokeWidth: clamp(number(e.strokeWidth, 0, 'Contorno'), 0, 20),
        shadow: e.shadow === true,
        autoFit: e.autoFit === true,
        ...(e.offerField === 'price' && e.priceBadge ? { priceBadge: normalizePriceBadge(e.priceBadge) } : {}),
        ...(typeof e.offerProductId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(e.offerProductId) &&
        ['name', 'price', 'unit'].includes(e.offerField)
          ? { offerProductId: e.offerProductId, offerField: e.offerField }
          : {}),
        ...(typeof e.linkedProductId === 'string' && ['name', 'price', 'unit'].includes(e.linkedField)
          ? { linkedProductId: id(e.linkedProductId), linkedField: e.linkedField }
          : {}),
      };
    if (e.type === 'product')
      return {
        ...base,
        name: string(e.name, 'Nome do produto', 180),
        placeholder: e.placeholder === true,
        ...(Number.isSafeInteger(e.priceCents) && e.priceCents >= 0 ? { priceCents: e.priceCents } : {}),
        priceText: string(e.priceText, '', 40),
        unit: string(e.unit, 'un', 40),
        image: imageSource(e.image),
        background: color(e.background, '#ffffff'),
        textColor: color(e.textColor, '#242424'),
        priceColor: color(e.priceColor, '#c5161d'),
        fontFamily: font(e.fontFamily),
        layout: e.layout === 'photo' ? 'photo' : 'card',
        transparent: e.transparent === true,
      };
    if (e.type === 'image') return { ...base, src: imageSource(e.src), fit: e.fit === 'cover' ? 'cover' : 'contain' };
    return {
      ...base,
      fill: color(e.fill, '#c5161d'),
      shapeKind: ['ellipse', 'rounded'].includes(e.shapeKind) ? e.shapeKind : 'rectangle',
      radius: clamp(number(e.radius, 24, 'Arredondamento'), 0, 500),
    };
  });
  const result = {
    id: id(value.id),
    title: string(value.title, 'Nova arte', 160),
    status: value.status === 'created' ? 'created' : 'draft',
    width,
    height,
    bgColor: color(value.bgColor, '#fff5d6'),
    createdAt: date(value.createdAt),
    updatedAt: date(value.updatedAt),
    elements,
  };
  if (value.publication != null) result.publication = validatePublication(value.publication);
  if (value.guides) {
    const axis = (key, extent) =>
      [
        ...new Set(
          (Array.isArray(value.guides[key]) ? value.guides[key] : []).filter(
            (position) => Number.isFinite(position) && position >= 0 && position <= extent,
          ),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 100);
    result.guides = { x: axis('x', width), y: axis('y', height) };
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_JSON_BYTES)
    throw new Error('A arte excede o limite de 25 MB. Reduza as fotos.');
  return result;
}
export function createHistory(initial) {
  let states = [clone(initial)],
    index = 0;
  return {
    current: () => clone(states[index]),
    commit(design) {
      const next = clone(design);
      if (sameState(next, states[index])) return this.current();
      states = states.slice(0, index + 1);
      states.push(next);
      if (states.length > 50) states.shift();
      index = states.length - 1;
      return this.current();
    },
    undo() {
      if (index > 0) index--;
      return this.current();
    },
    redo() {
      if (index < states.length - 1) index++;
      return this.current();
    },
    canUndo: () => index > 0,
    canRedo: () => index < states.length - 1,
  };
}
