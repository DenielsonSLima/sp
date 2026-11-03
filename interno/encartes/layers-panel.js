import { bindLayerReorder } from './editor/layer-reorder.js';

const symbols = {
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  visible: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="m3 3 18 18M10 5c8-1 12 7 12 7a19 19 0 0 1-4 5M6 6a20 20 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1"/>',
  locked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlocked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-3M12 14v3"/>',
  up: '<path d="m5 14 7-7 7 7M12 7v14"/>',
  down: '<path d="m5 10 7 7 7-7M12 17V3"/>',
  text: '<path d="M4 6V3h16v3M12 3v18M8 21h8"/>',
  shape: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
};
const svg = (name) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] || symbols.image}</svg>`;
export function layerName(element, index) {
  return (
    element.label ||
    (element.type === 'text'
      ? element.text.trim().slice(0, 40) || 'Texto sem conteúdo'
      : element.type === 'product'
        ? element.name || 'Produto'
        : element.type === 'shape'
          ? 'Faixa de cor'
          : `Imagem ${index + 1}`)
  );
}

export function createLayersPanel(root, { onSelect, onMove, onToggleVisibility, onToggleLock }) {
  root.innerHTML = `<header class="studio-layers-heading"><h2 id="flyer-layers-title">${svg('layers')} Camadas</h2><span class="studio-layer-count"></span></header><p class="studio-layers-hint">As primeiras ficam à frente.</p><div class="studio-layer-list" role="group" aria-label="Camadas da arte"></div><p class="studio-layer-empty">Adicione texto ou imagens à sua arte.</p><footer class="studio-layer-order"><button type="button" data-layer-order="1">${svg('up')} Subir</button><button type="button" data-layer-order="-1">${svg('down')} Descer</button></footer>`;
  const list = root.querySelector('.studio-layer-list'),
    rows = new Map();
  root.querySelector('.studio-layers-hint').textContent = 'Arraste para reordenar. As primeiras ficam à frente.';
  const disposeReorder = bindLayerReorder(list, { onMove, onSelect });
  let design = null,
    selection = null;
  const button = (action, title) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.dataset.action = action;
    node.title = title;
    node.setAttribute('aria-label', title);
    return node;
  };
  const createRow = (id) => {
    const row = document.createElement('div');
    row.className = 'studio-layer-row';
    row.dataset.id = id;
    const visibility = button('visibility', 'Ocultar camada'),
      select = button('select', 'Selecionar camada'),
      lock = button('lock', 'Bloquear camada');
    visibility.className = 'studio-layer-visibility';
    select.className = 'studio-layer-select';
    lock.className = 'studio-layer-lock';
    const thumbnail = document.createElement('span'),
      info = document.createElement('span'),
      name = document.createElement('strong'),
      meta = document.createElement('small');
    thumbnail.className = 'studio-layer-thumbnail';
    info.className = 'studio-layer-label';
    info.append(name, meta);
    select.append(thumbnail, info);
    row.append(visibility, select, lock);
    return { row, visibility, select, lock, thumbnail, name, meta, image: null, source: null };
  };
  const update = (next, selected) => {
    design = next;
    selection = selected;
    const ids = new Set(design.elements.map((element) => element.id));
    for (const [id, entry] of rows)
      if (!ids.has(id)) {
        entry.row.remove();
        rows.delete(id);
      }
    for (let index = design.elements.length - 1; index >= 0; index--) {
      const element = design.elements[index];
      let entry = rows.get(element.id);
      if (!entry) {
        entry = createRow(element.id);
        rows.set(element.id, entry);
      }
      const title = layerName(element, index),
        kind = { text: 'Texto', product: 'Produto', shape: 'Faixa', image: 'Imagem' }[element.type];
      entry.row.classList.toggle('selected', element.id === selection);
      entry.row.classList.toggle('hidden-layer', element.hidden);
      entry.name.textContent = title;
      entry.meta.textContent = element.locked ? 'Bloqueada' : kind;
      entry.select.setAttribute('aria-label', `Selecionar ${title}`);
      entry.select.setAttribute('aria-pressed', String(element.id === selection));
      entry.visibility.setAttribute('aria-label', `${element.hidden ? 'Mostrar' : 'Ocultar'} ${title}`);
      entry.visibility.title = entry.visibility.getAttribute('aria-label');
      entry.visibility.setAttribute('aria-pressed', String(!element.hidden));
      const visibilityState = element.hidden ? 'hidden' : 'visible';
      if (entry.visibility.dataset.state !== visibilityState) {
        entry.visibility.innerHTML = svg(visibilityState);
        entry.visibility.dataset.state = visibilityState;
      }
      entry.lock.setAttribute('aria-label', `${element.locked ? 'Desbloquear' : 'Bloquear'} ${title}`);
      entry.lock.title = entry.lock.getAttribute('aria-label');
      entry.lock.setAttribute('aria-pressed', String(element.locked));
      const lockState = element.locked ? 'locked' : 'unlocked';
      if (entry.lock.dataset.state !== lockState) {
        entry.lock.innerHTML = svg(lockState);
        entry.lock.dataset.state = lockState;
      }
      const source = element.type === 'image' ? element.src : element.type === 'product' ? element.image : '';
      if (entry.source !== source || entry.thumbnail.dataset.type !== element.type) {
        entry.source = source;
        entry.thumbnail.dataset.type = element.type;
        entry.thumbnail.replaceChildren();
        if (source) {
          const image = document.createElement('img');
          image.alt = '';
          image.loading = 'lazy';
          image.decoding = 'async';
          image.src = source;
          entry.thumbnail.append(image);
        } else entry.thumbnail.innerHTML = svg(element.type);
      }
      if (element.type === 'shape') entry.thumbnail.style.backgroundColor = element.fill;
      else entry.thumbnail.style.backgroundColor = '';
      const position = design.elements.length - 1 - index;
      if (list.children[position] !== entry.row) list.insertBefore(entry.row, list.children[position] || null);
    }
    root.querySelector('.studio-layer-count').textContent = String(design.elements.length);
    root.querySelector('.studio-layer-empty').hidden = Boolean(design.elements.length);
    const index = design.elements.findIndex((element) => element.id === selection);
    root.querySelector('[data-layer-order="1"]').disabled = index < 0 || index === design.elements.length - 1;
    root.querySelector('[data-layer-order="-1"]').disabled = index <= 0;
  };
  const click = (event) => {
    const target = event.target.closest('button');
    if (!target || !root.contains(target)) return;
    if (target.dataset.layerOrder) {
      if (selection) onMove(selection, Number(target.dataset.layerOrder));
      return;
    }
    const id = target.closest('[data-id]')?.dataset.id;
    if (!design?.elements.some((element) => element.id === id)) return;
    if (target.dataset.action === 'select') onSelect(id);
    if (target.dataset.action === 'visibility') onToggleVisibility(id);
    if (target.dataset.action === 'lock') onToggleLock(id);
  };
  root.addEventListener('click', click);
  return {
    update,
    destroy: () => {
      disposeReorder();
      root.removeEventListener('click', click);
      rows.clear();
    },
  };
}
