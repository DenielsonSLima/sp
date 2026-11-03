import { fillTemplateProducts } from './layered-templates.js';
import { escapeHtml } from '../../shared/ui.js';
import { getDataContext, subscribeResource } from '../../shared/data/api.js';
import { materializeProductPhoto } from '../cadastros/produtos/photo.js';
import { createDesign } from './model.js';
import { templates, applyTemplate } from './templates.js';
import { renderDesign } from './renderer.js';
const formats = [
  ['portrait', 'Post retrato', 1080, 1350],
  ['square', 'Post quadrado', 1080, 1080],
  ['story', 'Story', 1080, 1920],
];
const fold = (value) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const state = { query: '', count: '', format: 'portrait' };
const galleries = new WeakMap();
let contextRevision = 0;
subscribeResource('products', () => {
  if (!getDataContext()) {
    contextRevision++;
    Object.assign(state, { query: '', count: '', format: 'portrait' });
  }
});
const scopeKey = (context) => JSON.stringify([context?.companyId, context?.user?.id, contextRevision]);
const assertCurrent = (isCurrent) => {
  if (!isCurrent()) {
    const error = Error('A sessão ou a galeria mudou durante o carregamento. Abra o modelo novamente.');
    error.code = 'STALE_GALLERY';
    throw error;
  }
};

// Pure synchronous composition continues to accept document-safe image data only.
export function templateDesign(design, id, catalog = []) {
  const template = templates.find((t) => t.id === id);
  const result = applyTemplate(design, id);
  return template?.category ? fillTemplateProducts(result, catalog, { category: template.category }) : result;
}

// Copy only photos used by this template; never pass temporary Storage URLs to a design.
export async function prepareTemplateDesign(
  design,
  id,
  catalog = [],
  {
    preview = false,
    materialize = materializeProductPhoto,
    resolvePhoto = (product) => product.photo || product.image || '',
    isCurrent = () => true,
  } = {},
) {
  assertCurrent(isCurrent);
  const template = templates.find((t) => t.id === id),
    result = applyTemplate(design, id);
  if (!preview && !template.category) return result;
  const slots = result.elements.filter((element) => element.type === 'product' && element.placeholder).length;
  const preferred = catalog.filter((product) => !template.category || product.category === template.category);
  const pool = preferred.length ? preferred : catalog;
  const prepared = await Promise.all(
    pool.slice(0, slots).map(async (product) => {
      assertCurrent(isCurrent);
      const source = await resolvePhoto(product);
      assertCurrent(isCurrent);
      const photo = await materialize(source);
      assertCurrent(isCurrent);
      return { name: product.name, unit: product.unit, priceText: product.priceText, photo };
    }),
  );
  assertCurrent(isCurrent);
  return fillTemplateProducts(result, prepared, { preview, category: '' });
}

export function renderTemplateGallery(
  root,
  { onChoose, onBlank, catalog = [], resolvePhoto = (product) => product.photo || product.image || '' },
) {
  galleries.get(root)?.();
  root.innerHTML = `<section class="card flyer-model-filters"><label>Buscar modelo<input type="search" name="templateSearch" placeholder="Destaque, festival..." value="${escapeHtml(state.query)}"></label><label>Produtos<select name="templateCount"><option value="">Todos os modelos</option>${[
    ...new Set(templates.map((template) => template.productCount)),
  ]
    .sort((a, b) => a - b)
    .map(
      (n) =>
        `<option value="${n}" ${state.count === String(n) ? 'selected' : ''}>${n} produto${n === 1 ? '' : 's'}</option>`,
    )
    .join(
      '',
    )}</select></label><label>Formato<select name="templateFormat">${formats.map(([id, label]) => `<option value="${id}" ${state.format === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="button secondary model-blank" type="button">＋ Começar em branco</button></section><p class="flyer-model-message" role="status" aria-live="polite"></p><div class="flyer-model-grid"></div>`;
  const grid = root.querySelector('.flyer-model-grid'),
    feedback = root.querySelector('.flyer-model-message');
  const scope = scopeKey(getDataContext());
  let active = true,
    generation = 0,
    choosing = false,
    observer;
  const photos = new Map();
  const current = () =>
    active &&
    root.isConnected &&
    scopeKey(getDataContext()) === scope &&
    root.querySelector('.flyer-model-grid') === grid;
  const cleanup = () => {
    active = false;
    generation++;
    photos.clear();
    unsubscribe();
    observer?.disconnect();
    globalThis.window?.removeEventListener('hashchange', cleanup);
  };
  const unsubscribe = subscribeResource('products', () => {
    if (!current()) cleanup();
  });
  galleries.set(root, cleanup);
  globalThis.window?.addEventListener('hashchange', cleanup, { once: true });
  if (globalThis.MutationObserver && globalThis.document?.body) {
    observer = new MutationObserver(() => {
      if (!current()) cleanup();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  const materialize = (source) => {
    if (!source) return Promise.resolve('');
    if (!photos.has(source)) {
      const pending = materializeProductPhoto(source).catch((error) => {
        photos.delete(source);
        throw error;
      });
      photos.set(source, pending);
    }
    return photos.get(source);
  };
  const dimensions = () => formats.find((f) => f[0] === state.format);
  const fresh = () => {
    const f = dimensions();
    return createDesign({ width: f[2], height: f[3] });
  };
  const report = (text, error = false) => {
    if (!current()) return;
    feedback.textContent = text;
    feedback.classList.toggle('error', error);
  };
  const setBusy = (busy) => {
    if (!current()) return;
    root
      .querySelectorAll('[data-template],.model-blank,[name=templateSearch],[name=templateCount],[name=templateFormat]')
      .forEach((button) => (button.disabled = busy));
  };
  const choose = async (id) => {
    if (choosing || !current()) return;
    choosing = true;
    setBusy(true);
    report('Preparando imagens do modelo…');
    const token = generation,
      isCurrent = () => current() && token === generation;
    try {
      const design = id
        ? await prepareTemplateDesign(fresh(), id, catalog, { materialize, resolvePhoto, isCurrent })
        : fresh();
      assertCurrent(isCurrent);
      await (id ? onChoose(design) : onBlank(design));
      if (isCurrent()) report('');
    } catch (error) {
      if (isCurrent()) report('Não foi possível abrir o modelo: ' + error.message, true);
    } finally {
      choosing = false;
      if (isCurrent()) setBusy(false);
    }
  };
  root.querySelector('.model-blank').onclick = () => choose(null);
  const paint = () => {
    if (!current()) return;
    const token = ++generation;
    const rows = [...templates]
      .sort((a, b) => Number(Boolean(b.category)) - Number(Boolean(a.category)))
      .filter(
        (t) => (!state.count || t.productCount === Number(state.count)) && fold(t.name).includes(fold(state.query)),
      );
    grid.innerHTML = rows.length
      ? rows
          .map(
            (t) =>
              `<article class="card flyer-model-card"><button class="flyer-model-preview" type="button" data-template="${escapeHtml(t.id)}" aria-label="Usar modelo ${escapeHtml(t.name)}"><canvas aria-hidden="true"></canvas><span>Usar este modelo →</span></button><div class="flyer-model-description"><span class="tag">${t.productCount === 1 ? 'PRODUTO ÚNICO' : t.productCount + ' PRODUTOS'}</span><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.description)}</p><small>${dimensions()[2]} × ${dimensions()[3]} px</small></div></article>`,
          )
          .join('')
      : `<section class="card flyer-empty-library"><h2>${templates.length ? 'Nenhum modelo encontrado.' : 'Nenhum modelo de encarte cadastrado no banco.'}</h2><p>${templates.length ? 'Altere a busca ou a quantidade de produtos.' : 'Cadastre um modelo ou comece uma arte em branco.'}</p></section>`;
    grid.querySelectorAll('[data-template]').forEach((button) => {
      const id = button.dataset.template,
        canvas = button.querySelector('canvas');
      const isCurrent = () => current() && token === generation && button.isConnected && canvas.isConnected;
      button.onclick = () => choose(id);
      const preview = async () => {
        try {
          const design = await prepareTemplateDesign(fresh(), id, catalog, {
            preview: true,
            materialize,
            resolvePhoto,
            isCurrent,
          });
          design.elements
            .filter((e) => e.type === 'product')
            .forEach((e, i) => {
              if (e.placeholder) e.name = 'Produto ' + (i + 1);
              e.priceText = 'R$ —,—';
            });
          assertCurrent(isCurrent);
          await renderDesign(canvas, design, { scale: 360 / design.width });
        } catch (error) {
          if (!isCurrent()) return;
          canvas.replaceWith(document.createTextNode('Prévia indisponível'));
          report('Não foi possível carregar a prévia. Selecione o modelo para tentar novamente.', true);
        }
      };
      void preview();
    });
  };
  root.querySelector('[name=templateSearch]').oninput = (e) => {
    if (choosing || !current()) return;
    state.query = e.target.value;
    paint();
  };
  root.querySelector('[name=templateCount]').onchange = (e) => {
    if (choosing || !current()) return;
    state.count = e.target.value;
    paint();
  };
  root.querySelector('[name=templateFormat]').onchange = (e) => {
    if (choosing || !current()) return;
    state.format = e.target.value;
    paint();
  };
  paint();
  return cleanup;
}
