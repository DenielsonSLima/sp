import { scenes, sceneCollections } from '../scene-catalog.js';
import { createDesign, newId, validateDesign, MAX_IMAGE_BYTES } from '../model.js';
import { getDataContext, subscribeResource } from '../../../shared/data/api.js';
import { escapeHtml } from '../../../shared/ui.js';
import { createSceneOfferElements } from './scene-offers.js';
import { sceneOfferPositions } from './offer-positions.js';

const fold = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const matches = (reference, product) => reference.key === product.id || reference.key === product.code;
const sceneProducts = (scene, catalog) =>
  scene.products.map((reference) => catalog.find((product) => matches(reference, product)));
const galleries = new WeakMap();
let contextRevision = 0;
subscribeResource('products', () => {
  if (!getDataContext()) contextRevision++;
});
const scope = () => {
  const context = getDataContext();
  return JSON.stringify([context?.companyId, context?.user?.id, contextRevision]);
};
function assertCurrent(isCurrent) {
  if (!isCurrent()) throw Error('A sessão ou a galeria mudou. Escolha o cenário novamente.');
}

export function availableScenes(
  catalog,
  { query = '', theme = 'natal', collection = 'all', category = '', subcategory = '' } = {},
) {
  const needle = fold(query);
  return scenes.filter((scene) => {
    const products = sceneProducts(scene, catalog);
    return (
      products.every(Boolean) &&
      (!theme || scene.theme === theme) &&
      (collection === 'all' || scene.collection === collection) &&
      products.some(
        (product) =>
          (!category || product.category === category) && (!subcategory || product.subcategoryId === subcategory),
      ) &&
      fold(
        [
          scene.theme === 'natal' ? 'Natal Natalina' : '',
          scene.title,
          ...scene.products.map((product) => product.name),
          ...products.flatMap((product) => [product?.name, product?.code]),
        ].join(' '),
      ).includes(needle)
    );
  });
}

export function sceneFilterOptions(catalog, category = '') {
  const categories = [...new Set(catalog.map((product) => product.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  const subcategories = [
    ...new Map(
      catalog
        .filter(
          (product) => (!category || product.category === category) && product.subcategoryId && product.subcategory,
        )
        .map((product) => [product.subcategoryId, { id: product.subcategoryId, name: product.subcategory }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { categories, subcategories };
}

const filterMarkup = () =>
  `<section class="scene-filters card" aria-label="Filtros da galeria"><label>Buscar<input type="search" class="scene-filter-query" placeholder="Coleção, cenário, produto ou código…" maxlength="180"></label><label>Categoria de produto<select class="scene-filter-category"></select></label><label>Subcategoria de produto<select class="scene-filter-subcategory"></select></label><button type="button" class="button secondary scene-clear-filters">Limpar filtros</button></section>`;
function bindSceneFilters(root, { catalog, filters, onChange, isCurrent, isBusy = () => false }) {
  const query = root.querySelector('.scene-filter-query'),
    category = root.querySelector('.scene-filter-category'),
    subcategory = root.querySelector('.scene-filter-subcategory');
  const sync = () => {
    const options = sceneFilterOptions(catalog, filters.category);
    category.innerHTML =
      '<option value="">Todas as categorias</option>' +
      options.categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    category.value = filters.category;
    subcategory.innerHTML =
      '<option value="">Todas as subcategorias</option>' +
      options.subcategories
        .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`)
        .join('');
    subcategory.value = filters.subcategory;
    query.value = filters.query;
  };
  query.oninput = () => {
    if (isCurrent() && !isBusy()) {
      filters.query = query.value;
      onChange();
    }
  };
  category.onchange = () => {
    if (isCurrent() && !isBusy()) {
      filters.category = category.value;
      filters.subcategory = '';
      sync();
      onChange();
    }
  };
  subcategory.onchange = () => {
    if (isCurrent() && !isBusy()) {
      filters.subcategory = subcategory.value;
      onChange();
    }
  };
  root.querySelector('.scene-clear-filters').onclick = () => {
    if (isCurrent() && !isBusy()) {
      Object.assign(filters, { query: '', category: '', subcategory: '' });
      sync();
      onChange();
      query.focus();
    }
  };
  sync();
}

async function readSceneImage(src) {
  if (!scenes.some((scene) => scene.src === src)) throw Error('Cenário não reconhecido.');
  const response = await fetch(src);
  if (!response.ok) throw Error('Não foi possível carregar a fotografia. Tente novamente.');
  const blob = await response.blob();
  if (blob.type !== 'image/webp' || !blob.size || blob.size > MAX_IMAGE_BYTES)
    throw Error('A fotografia do cenário é inválida.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Não foi possível preparar a fotografia.'));
    reader.readAsDataURL(blob);
  });
}

// Embed the photograph before opening: saved drafts never depend on temporary URLs.
export async function prepareSceneDesign(id, catalog, { readImage = readSceneImage, isCurrent = () => true } = {}) {
  assertCurrent(isCurrent);
  const scene = availableScenes(catalog).find((scene) => scene.id === id);
  if (!scene) throw Error('Este cenário não está disponível para os produtos desta empresa.');
  const src = await readImage(scene.src);
  assertCurrent(isCurrent);
  if (!availableScenes(catalog).some((available) => available.id === id))
    throw Error('Os produtos deste cenário mudaram. Escolha o cenário novamente.');
  // Resolve after loading so refreshed metadata supplies the current description and price.
  const products = sceneProducts(scene, catalog);
  if (!/^data:image\/webp;base64,/.test(src)) throw Error('A fotografia precisa estar incorporada à arte.');
  const design = createDesign({ title: scene.title + ' · Natal', width: 1080, height: 1920 });
  design.bgColor = '#ffffff';
  design.elements = [
    {
      id: newId(),
      type: 'image',
      label: 'Cenário Natal · ' + scene.title,
      src,
      fit: 'cover',
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
      locked: true,
    },
    ...createSceneOfferElements(design, products, sceneOfferPositions[scene.id]),
  ];
  return validateDesign(design);
}

function renderScenePhotos(root, { catalog = [], onChoose, filters }) {
  galleries.get(root)?.();
  let active = true,
    busy = false,
    collection = 'all',
    dialog = null;
  const initialScope = scope();
  root.innerHTML = `${filterMarkup()}<div class="scene-collections" role="group" aria-label="Filtrar cenários"></div><div class="scene-results-line"><p class="scene-count" role="status" aria-live="polite"></p><span>Fotografias criadas com IA</span></div><p class="scene-feedback" role="status" aria-live="polite"></p><div class="scene-grid"></div>`;
  const grid = root.querySelector('.scene-grid'),
    feedback = root.querySelector('.scene-feedback');
  const current = () =>
    active && root.isConnected && scope() === initialScope && root.querySelector('.scene-grid') === grid;
  const report = (text, error = false) => {
    if (current()) {
      feedback.textContent = text;
      feedback.classList.toggle('error', error);
    }
  };
  const controls = () => [...root.querySelectorAll('button,input,select')];
  const setBusy = (value) => {
    busy = value;
    controls().forEach((button) => (button.disabled = value));
    dialog?.querySelectorAll('button[data-use]').forEach((button) => (button.disabled = value));
  };
  const choose = async (id) => {
    if (busy || !current()) return;
    setBusy(true);
    report('Preparando a fotografia, as descrições e os campos de preço…');
    try {
      const design = await prepareSceneDesign(id, catalog, { isCurrent: current });
      assertCurrent(current);
      await onChoose(design);
      if (current()) report('');
    } catch (error) {
      report(error.message, true);
      if (dialog?.open) {
        const status = dialog.querySelector('[role=status]');
        status.textContent = error.message;
      }
    } finally {
      if (current()) setBusy(false);
    }
  };
  const preview = (id) => {
    if (busy || !current()) return;
    const scene = availableScenes(catalog).find((scene) => scene.id === id);
    if (!scene) return;
    const products = sceneProducts(scene, catalog);
    const opener = document.activeElement;
    dialog?.close();
    dialog = document.createElement('dialog');
    dialog.className = 'scene-dialog';
    dialog.setAttribute('aria-label', scene.title);
    dialog.innerHTML = `<div class="scene-dialog-layout"><div class="scene-dialog-photo"><img src="${escapeHtml(scene.src)}" width="1080" height="1920" alt="${escapeHtml(scene.title)}, cenário fotográfico natalino"></div><div class="scene-dialog-info"><button class="scene-dialog-close" type="button" aria-label="Fechar prévia">×</button><span class="scene-kicker">NATAL · STORIES</span><h2>${escapeHtml(scene.title)}</h2><p>Abra a oferta com as descrições e os campos de preço já montados.</p><ul>${products.map((product) => `<li>${escapeHtml(product.name)}</li>`).join('')}</ul><p class="scene-preview-help">1080 × 1920 px · Retrato<br>Os dados vêm dos produtos desta foto. Sem preço cadastrado, o campo fica pronto para preencher. No editor, você pode alterar textos, valores, cores e posições.</p><p role="status" aria-live="polite"></p><button class="button primary" data-use="${scene.id}" type="button">Usar no editor →</button></div></div>`;
    document.body.append(dialog);
    const opened = dialog;
    opened.querySelector('.scene-dialog-close').onclick = () => opened.close();
    opened.querySelector('[data-use]').onclick = () => choose(id);
    opened.querySelector('img').onerror = () => {
      opened.querySelector('[role=status]').textContent =
        'Não foi possível carregar a fotografia. Feche a prévia e tente novamente.';
      opened.querySelector('[data-use]').disabled = true;
    };
    opened.addEventListener(
      'close',
      () => {
        opened.remove();
        if (dialog === opened) dialog = null;
        if (opener?.isConnected) opener.focus();
      },
      { once: true },
    );
    opened.addEventListener('click', (event) => {
      if (event.target === opened) opened.close();
    });
    opened.showModal();
    opened.querySelector('.scene-dialog-close').focus();
  };
  const all = availableScenes(catalog);
  const paint = () => {
    if (!current()) return;
    const rows = availableScenes(catalog, { ...filters, collection });
    const filtered = availableScenes(catalog, filters);
    root.querySelector('.scene-collections').innerHTML = sceneCollections
      .map(
        ([key, label]) =>
          `<button type="button" data-collection="${key}" aria-pressed="${collection === key}">${label}<span>${filtered.filter((scene) => key === 'all' || scene.collection === key).length}</span></button>`,
      )
      .join('');
    root.querySelectorAll('[data-collection]').forEach(
      (button) =>
        (button.onclick = () => {
          if (busy) return;
          collection = button.dataset.collection;
          paint();
        }),
    );
    root.querySelector('.scene-count').textContent =
      `${rows.length} cenário${rows.length === 1 ? '' : 's'}${filters.query ? ' encontrado' + (rows.length === 1 ? '' : 's') : ''} · Coleção Natal`;
    grid.innerHTML = rows.length
      ? rows
          .map(
            (scene) =>
              `<article class="scene-card"><button class="scene-card-photo" type="button" data-preview="${scene.id}" aria-label="Ampliar ${escapeHtml(scene.title)}"><img src="${escapeHtml(scene.thumbnail)}" alt="${escapeHtml(scene.title)}, fotografia natalina com produtos" width="360" height="640" loading="lazy" decoding="async"><span class="scene-photo-tag">NATAL</span><span class="scene-photo-open">Ampliar cenário ↗</span></button><div class="scene-card-info"><span class="scene-card-meta">STORIES <span>1080 × 1920</span></span><h3>${escapeHtml(scene.title)}</h3><p>${sceneProducts(scene, catalog).map((product) => escapeHtml(product.name)).join(' + ')}</p><button class="scene-card-use" type="button" data-use="${scene.id}">Usar no editor <span aria-hidden="true">→</span></button></div></article>`,
          )
          .join('')
      : `<section class="card scene-empty"><h3>${all.length ? 'Nenhum cenário encontrado.' : 'Ainda não há cenários para os produtos desta empresa.'}</h3><p>${all.length ? 'Experimente outra busca ou categoria.' : 'Os cenários desta coleção aparecem quando seus produtos estão disponíveis no cadastro.'}</p></section>`;
    grid
      .querySelectorAll('[data-preview]')
      .forEach((button) => (button.onclick = () => preview(button.dataset.preview)));
    grid.querySelectorAll('[data-use]').forEach((button) => (button.onclick = () => choose(button.dataset.use)));
    grid.querySelectorAll('img').forEach(
      (img) =>
        (img.onerror = () => {
          img.hidden = true;
          const button = img.closest('button');
          button.insertAdjacentHTML(
            'afterbegin',
            '<span class="scene-photo-error">Prévia indisponível<br>Abra o cenário para tentar novamente.</span>',
          );
        }),
    );
  };
  bindSceneFilters(root, { catalog, filters, onChange: paint, isCurrent: current, isBusy: () => busy });
  const cleanup = () => {
    if (!active) return;
    active = false;
    dialog?.close();
    dialog?.remove();
    dialog = null;
    window.removeEventListener('hashchange', cleanup);
  };
  galleries.set(root, cleanup);
  window.addEventListener('hashchange', cleanup, { once: true });
  paint();
  return cleanup;
}

// Open an occasion first, then browse its photographs.
export function renderSceneGallery(root, { catalog = [], onChoose }) {
  galleries.get(root)?.();
  let active = true,
    photosCleanup = null;
  const filters = { query: '', category: '', subcategory: '' };
  const initialScope = scope();
  const current = () => active && root.isConnected && scope() === initialScope;
  const showCategories = (restoreFocus = false) => {
    if (!current()) return;
    photosCleanup?.();
    photosCleanup = null;
    root.innerHTML =
      filterMarkup() +
      '<p class="scene-category-count" role="status" aria-live="polite"></p><div class="scene-category-grid"></div>';
    const paint = () => {
      if (!current()) return;
      const rows = availableScenes(catalog, filters),
        filtered = Boolean(filters.query || filters.category || filters.subcategory);
      const count = rows.length,
        covers = (rows.length ? rows : scenes.filter((scene) => scene.theme === 'natal')).slice(0, 3);
      const grid = root.querySelector('.scene-category-grid');
      root.querySelector('.scene-category-count').textContent =
        `${count || !filtered ? 1 : 0} coleção encontrada · ${count} ${count === 1 ? 'imagem disponível' : 'imagens disponíveis'}`;
      grid.innerHTML =
        !count && filtered
          ? '<section class="card scene-empty"><h3>Nenhuma coleção encontrada.</h3><p>Altere a busca, a categoria ou a subcategoria, ou limpe os filtros.</p></section>'
          : `<button type="button" class="scene-category-card" data-scene-category="natal" aria-label="Abrir categoria Natalina"><span class="scene-category-cover" aria-hidden="true">${covers.map((scene) => `<img src="${escapeHtml(scene.thumbnail)}" alt="" width="360" height="640" loading="lazy" decoding="async">`).join('')}<span class="scene-category-badge">NATAL</span></span><span class="scene-category-info"><span class="scene-category-meta">COLEÇÃO DE CENÁRIOS · STORIES</span><strong>Natalina</strong><span class="scene-category-description">Fotografias para suas ofertas de Natal.</span><span class="scene-category-footer"><span>${count} ${count === 1 ? 'imagem disponível' : 'imagens disponíveis'}</span><span>Ver imagens <span aria-hidden="true">→</span></span></span></span></button>`;
      const card = grid.querySelector('[data-scene-category]');
      if (card)
        card.onclick = () => {
          if (!current()) return;
          root.innerHTML =
            '<div class="scene-category-navigation"><button type="button" class="button secondary scene-back-categories">← Categorias</button><span>Galeria / Natalina</span></div><div class="scene-category-content"></div>';
          root.querySelector('.scene-back-categories').onclick = () => showCategories(true);
          photosCleanup = renderScenePhotos(root.querySelector('.scene-category-content'), {
            catalog,
            onChoose,
            filters,
          });
          root.querySelector('.scene-filter-query')?.focus({ preventScroll: true });
        };
      grid.querySelectorAll('.scene-category-cover img').forEach(
        (img) =>
          (img.onerror = () => {
            img.hidden = true;
          }),
      );
    };
    bindSceneFilters(root, { catalog, filters, onChange: paint, isCurrent: current });
    paint();
    if (restoreFocus)
      (root.querySelector('[data-scene-category]') || root.querySelector('.scene-filter-query')).focus({
        preventScroll: true,
      });
  };

  const cleanup = () => {
    if (!active) return;
    active = false;
    photosCleanup?.();
    photosCleanup = null;
  };
  galleries.set(root, cleanup);
  showCategories();
  return cleanup;
}
