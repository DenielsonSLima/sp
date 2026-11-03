import { mountAssetPreviews } from '../cadastros/biblioteca-marca/previews.js';
import { escapeHtml } from '../../shared/ui.js';
import { getDataContext } from '../../shared/data/api.js';
import { listAssets, listCategories, getAsset } from '../cadastros/biblioteca-marca/storage.js';
import { clearOnContextChange, watchResource } from '../cadastros/remote.js';

const state = { query: '', category: '', all: false, scope: '' };
const renders = new WeakMap();
let contextRevision = 0;
clearOnContextChange('brand_assets', () => {
  contextRevision++;
  Object.assign(state, { query: '', category: '', all: false, scope: '' });
});
const scopeKey = () => {
  const context = getDataContext();
  return JSON.stringify([context?.companyId, context?.user?.id]);
};
export async function renderBrandPanel(root, { onInsert, isActive = () => true, initialCategory = '' }) {
  renders.get(root)?.cleanup?.();
  const scope = scopeKey(),
    revision = contextRevision,
    token = {};
  let previewCleanup = null,
    paintVersion = 0,
    active = true,
    observer,
    stopContext,
    stopAssets,
    stopCategories;
  renders.set(root, token);
  if (state.scope !== scope) Object.assign(state, { query: '', category: '', all: false, scope });
  const current = () =>
    active &&
    root.isConnected &&
    isActive() &&
    renders.get(root) === token &&
    scopeKey() === scope &&
    contextRevision === revision;
  const cleanup = () => {
    if (!active) return;
    active = false;
    paintVersion++;
    previewCleanup?.();
    stopAssets?.();
    stopCategories?.();
    stopContext?.();
    observer?.disconnect();
  };
  token.cleanup = cleanup;
  stopContext = clearOnContextChange('brand_assets', () => {
    cleanup();
    if (renders.get(root) === token) root.replaceChildren();
  });
  observer = new MutationObserver(() => {
    if (!current()) cleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  root.innerHTML = '<h2>Biblioteca</h2><p class="flyer-help">Carregando suas pastas…</p>';
  try {
    const [assets, categories] = await Promise.all([listAssets(), listCategories()]);
    if (!current()) return;
    if (initialCategory && categories.includes(initialCategory)) {
      state.category = initialCategory;
      state.query = '';
      state.all = false;
    }
    if (!categories.includes(state.category)) state.category = '';
    root.innerHTML = `<h2>Biblioteca</h2><p class="flyer-help">Abra uma pasta e adicione logos, selos e outros PNGs à sua arte.</p><label>Buscar elemento<input class="brand-query" type="search" value="${escapeHtml(state.query)}" placeholder="Logo, Natal, ofertas…"></label><label>Categoria<select class="brand-category"><option value="">Todas as pastas</option>${categories.map((c) => `<option value="${escapeHtml(c)}" ${state.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label><div class="flyer-brand-path"><button type="button" class="flyer-brand-back">← Pastas</button><strong></strong></div><div class="flyer-brand-folders" aria-label="Pastas da biblioteca"></div><button class="button secondary flyer-brand-all" type="button">Ver todos os PNGs</button><p class="flyer-help flyer-brand-count" role="status" aria-live="polite"></p><div class="flyer-brand-list"></div><a class="flyer-panel-link" href="#cadastros/biblioteca-marca">Gerenciar Biblioteca →</a>`;
    const normalize = (value) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const paint = () => {
      if (!current()) return;
      previewCleanup?.();
      previewCleanup = null;
      const view = ++paintVersion;
      const showFolders = !state.category && !state.query.trim() && !state.all;
      const folderGrid = root.querySelector('.flyer-brand-folders'),
        assetGrid = root.querySelector('.flyer-brand-list');
      root.querySelector('.flyer-brand-path strong').textContent = state.category || 'Todos os PNGs';
      root.querySelector('.flyer-brand-path').hidden = showFolders;
      root.querySelector('.flyer-brand-all').hidden = !showFolders;
      folderGrid.hidden = !showFolders;
      assetGrid.hidden = showFolders;
      folderGrid.innerHTML = showFolders
        ? categories
            .map(
              (c) =>
                `<button type="button" class="brand-folder" data-folder="${escapeHtml(c)}"><span class="brand-folder-icon" aria-hidden="true">▰</span><span><strong>${escapeHtml(c)}</strong><small>${assets.filter((asset) => asset.category === c).length} PNG(s)</small></span><span class="brand-folder-arrow" aria-hidden="true">→</span></button>`,
            )
            .join('')
        : '';
      root.querySelectorAll('[data-folder]').forEach(
        (button) =>
          (button.onclick = () => {
            if (!current()) return;
            state.category = button.dataset.folder;
            state.all = false;
            root.querySelector('.brand-category').value = state.category;
            paint();
          }),
      );
      const rows = assets.filter(
        (asset) =>
          (!state.category || asset.category === state.category) &&
          normalize(asset.name + ' ' + asset.category).includes(normalize(state.query.trim())),
      );
      root.querySelector('.flyer-brand-count').textContent = showFolders
        ? `${categories.length} pasta(s)`
        : `${rows.length} PNG(s) · Toque para adicionar`;
      assetGrid.innerHTML = showFolders
        ? ''
        : rows.length
          ? rows
              .map(
                (asset) =>
                  `<button type="button" class="flyer-brand-choice" data-asset="${escapeHtml(asset.id)}"><img data-brand-preview="${escapeHtml(asset.id)}" alt="" loading="lazy"><span>${escapeHtml(asset.name)}</span></button>`,
              )
              .join('')
          : '<p class="flyer-help">Nenhum PNG nesta pasta ou busca. Adicione elementos na Biblioteca.</p>';
      if (!showFolders)
        previewCleanup = mountAssetPreviews(assetGrid, rows, {
          isCurrent: () => current() && view === paintVersion,
          onError: (error) => {
            root.querySelector('.flyer-brand-count').textContent = error.message;
          },
        });
      root.querySelectorAll('[data-asset]').forEach(
        (button) =>
          (button.onclick = async () => {
            const asset = assets.find((asset) => asset.id === button.dataset.asset);
            if (!asset || !current()) return;
            button.disabled = true;
            try {
              const full = await getAsset(asset.id, asset._version);
              if (current() && view === paintVersion) await onInsert(structuredClone(full));
            } catch (error) {
              if (current()) root.querySelector('.flyer-brand-count').textContent = error.message;
            } finally {
              if (button.isConnected) button.disabled = false;
            }
          }),
      );
    };
    root.querySelector('.brand-query').oninput = (event) => {
      if (!current()) return;
      state.query = event.target.value;
      paint();
    };
    root.querySelector('.brand-category').onchange = (event) => {
      if (!current()) return;
      state.category = event.target.value;
      state.all = false;
      paint();
    };
    root.querySelector('.flyer-brand-back').onclick = () => {
      if (!current()) return;
      state.category = '';
      state.query = '';
      state.all = false;
      root.querySelector('.brand-category').value = '';
      root.querySelector('.brand-query').value = '';
      paint();
    };
    root.querySelector('.flyer-brand-all').onclick = () => {
      if (!current()) return;
      state.all = true;
      paint();
    };
    paint();
    const refresh = () => {
      if (!current()) {
        cleanup();
        return;
      }
      return renderBrandPanel(root, { onInsert, isActive });
    };
    stopAssets = watchResource(root, 'brand_assets', refresh);
    stopCategories = watchResource(root, 'brand_categories', refresh);
  } catch (error) {
    if (current())
      root.innerHTML = '<h2>Biblioteca indisponível</h2><p class="flyer-help">' + escapeHtml(error.message) + '</p>';
  }
}
