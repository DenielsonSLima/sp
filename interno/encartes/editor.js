import { libraryMarkup, studioMarkup } from './views/studio.js';
import { createCanvasRenderer } from './editor/canvas-renderer.js';
import { bindStudioViewport } from './editor/viewport-controls.js';
import { bindEditorCanvas } from './editor/canvas-interaction.js';
import { createPropertiesRenderer } from './editor/properties.js';
import { renderInsertionPanel } from './editor/insertion.js';
import { tools, safeName } from './editor/presentation.js';
import { runtime, sessionKey, status, message, persist, scheduleSave } from './editor/autosave.js';
import { bindFinishButton } from './editor/finish.js';
import { bindPublicationHeader } from './editor/publication-header.js';
import { createCatalogPhotoLoader } from './hooks/catalog-photos.js';
export { createCatalogPhotoLoader } from './hooks/catalog-photos.js';
import { createLayersPanel } from './layers-panel.js';
import { moveLayer } from './editor/layer-reorder.js';
import { renderDesignLibrary } from './design-library.js';
import { openDocumentSettings } from './document-settings.js';
import { getDataContext } from '../../shared/data/api.js';
import { watchFlyerLibrary, watchFlyerProducts, clearFlyersOnSessionChange } from './realtime.js';
import { renderBrandPanel } from './brand-panel.js';
import { renderSceneGallery } from './scene-gallery.js';
import { escapeHtml } from '../../shared/ui.js';
import { repository } from '../../shared/repository.js';
import { createDesign, validateDesign, newId, cloneDesignState } from './model.js';
import { getDesign } from './storage.js';
import { createPngBlob, downloadBlob } from './export.js';
import { editorState as S, openDesign, commitDesign } from './editor-state.js';
const clone = cloneDesignState;
const selected = () => S.design.elements.find((element) => element.id === S.selection);
export async function renderEditor(root, { initialDesign, onBack } = {}) {
  if (initialDesign) {
    clearTimeout(runtime.saveTimer);
    if (S.saveMessage === 'Alterações pendentes' && !(await persist()))
      throw Error('Salve a arte em edição antes de abrir outra página.');
  }
  S.cleanup?.();
  if (initialDesign) openDesign(initialDesign);
  runtime.activeRoot = root;
  if (!tools.some(([key]) => key === S.tool)) S.tool = 'text';
  const catalog = [];
  if (!root.isConnected) return;
  let brandFolder = '',
    resizeObserver,
    interaction,
    galleryCleanup,
    settingsCleanup,
    fullscreenCleanup,
    libraryController,
    layersController,
    catalogLoadVersion = 0,
    editorDisposed = false;
  const observer = new MutationObserver(() => {
    if (!root.isConnected) cleanup();
  });
  const cleanup = () => {
    editorDisposed = true;
    layersController?.destroy();
    settingsCleanup?.();
    fullscreenCleanup?.();
    libraryController?.dispose();
    loadCatalogPhoto.clear();
    galleryCleanup?.();
    galleryCleanup = null;
    resizeObserver?.disconnect();
    renderer.cancel();
    interaction?.destroy();
    interaction = null;
    observer.disconnect();
  };
  observer.observe(document.body, { childList: true, subtree: true });
  S.cleanup = cleanup;
  const editorScope = sessionKey();
  let catalogReady = false,
    catalogPromise = null;
  const ensureCatalog = () => {
    if (catalogReady) return Promise.resolve(catalog);
    if (catalogPromise) return catalogPromise;
    catalogPromise = repository
      .listProductMetadata()
      .then((rows) => {
        if (editorDisposed || !root.isConnected || sessionKey() !== editorScope)
          throw Error('A sessão mudou durante o carregamento do catálogo.');
        catalog.splice(0, catalog.length, ...rows);
        catalogReady = true;
        return catalog;
      })
      .finally(() => {
        catalogPromise = null;
      });
    return catalogPromise;
  };
  const loadCatalogPhoto = createCatalogPhotoLoader({
    loadPreviews: (rows, options) => repository.loadProductPreviews(rows, options),
    isCurrent: () => !editorDisposed && root.isConnected && sessionKey() === editorScope,
  });
  const update = (next, { panel = true } = {}) => {
    try {
      commitDesign(next);
      scheduleSave();
      refreshToolbar();
      renderLayers();
      draw();
      if (panel) renderPanel();
      return true;
    } catch (error) {
      message(error.message, true);
      return false;
    }
  };
  const mutate = (fn, options) => {
    try {
      const next = clone(S.design);
      fn(next);
      update(next, options);
    } catch (error) {
      message(error.message, true);
    }
  };
  const refreshToolbar = () => {
    if (!root.isConnected) return;
    const undo = root.querySelector('.flyer-undo'),
      redo = root.querySelector('.flyer-redo');
    if (undo) undo.disabled = !S.history.canUndo();
    if (redo) redo.disabled = !S.history.canRedo();
    const output = root.querySelector('.flyer-output-size');
    if (output) output.textContent = `${S.design.width} × ${S.design.height} px`;
  };
  const overlay = () => interaction?.select(S.selection);
  const renderer = createCanvasRenderer({
    root,
    state: S,
    getInteraction: () => interaction,
    isActive: () => !editorDisposed,
    message,
  });
  const { draw, requestDraw } = renderer;
  const select = (id) => {
    S.selection = id;
    root
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
    overlay();
    renderPanel();
  };
  const renderLayers = () => {
    const pane = root.querySelector('.flyer-layers-panel');
    if (!pane) return;
    if (!layersController)
      layersController = createLayersPanel(pane, {
        onSelect: select,
        onMove: (id, direction) =>
          mutate((d) => {
            moveLayer(d.elements, id, direction);
          }),
        onToggleVisibility: (id) =>
          mutate((d) => {
            const item = d.elements.find((element) => element.id === id);
            item.hidden = !item.hidden;
          }),
        onToggleLock: (id) =>
          mutate((d) => {
            const item = d.elements.find((element) => element.id === id);
            item.locked = !item.locked;
          }),
      });
    layersController.update(S.design, S.selection);
  };

  const renderProperties = createPropertiesRenderer({
    root,
    state: S,
    selected,
    mutate,
    update,
    message,
    ensureCatalog,
    loadCatalogPhoto,
    getRevision: () => runtime.revision,
    isCurrent: () => !editorDisposed && root.isConnected,
    renderPanel: () => renderPanel(),
    catalog,
  });
  const renderPanel = () => {
    renderLayers();
    renderProperties();
    const pane = root.querySelector('.flyer-tool-panel');
    if (!pane) return;
    if (pane.dataset.tool === S.tool && !brandFolder) return;
    pane.dataset.tool = S.tool;
    pane.innerHTML = '';
    root
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
    if (S.tool === 'brand') {
      const initialCategory = brandFolder;
      brandFolder = '';
      renderBrandPanel(pane, {
        initialCategory,
        isActive: () => S.tool === 'brand',
        onInsert: (asset) => {
          const maxW = S.design.width * 0.6,
            maxH = S.design.height * 0.6,
            scale = Math.min(maxW / asset.width, maxH / asset.height);
          const element = {
            id: newId(),
            type: 'image',
            label: asset.name || asset.label || 'Imagem da biblioteca',
            src: asset.dataURL,
            width: asset.width * scale,
            height: asset.height * scale,
            x: (S.design.width - asset.width * scale) / 2,
            y: (S.design.height - asset.height * scale) / 2,
            locked: false,
          };
          S.selection = element.id;
          mutate((d) => d.elements.push(element));
        },
      });
    }
    if (S.tool === 'text')
      renderInsertionPanel({
        pane,
        root,
        state: S,
        mutate,
        message,
        onLibrary: (category) => {
          brandFolder = category;
          S.tool = 'brand';
          renderPanel();
        },
      });
  };
  const bindCanvas = async () => {
    const viewVersion = runtime.renderVersion;
    const created = await bindEditorCanvas({
      root,
      state: S,
      selected,
      select,
      update,
      requestDraw,
      mutate,
      message,
      isCurrent: () => !editorDisposed && viewVersion === runtime.renderVersion,
      getGuides: renderer.getGuidePositions,
      onSnap: renderer.showSnaps,
    });
    if (created) interaction = created;
  };
  const paint = async () => {
    layersController?.destroy();
    layersController = null;
    libraryController?.dispose();
    libraryController = null;
    settingsCleanup?.();
    settingsCleanup = null;
    galleryCleanup?.();
    galleryCleanup = null;
    const viewVersion = ++runtime.renderVersion;
    fullscreenCleanup?.();
    root.classList.toggle('flyer-editing', S.tab === 'create');
    renderer.cancel();
    resizeObserver?.disconnect();
    interaction?.destroy();
    interaction = null;
    root.innerHTML = libraryMarkup(S);
    bindPublicationHeader(root, { onBack, persist, runtime, message, cleanup });
    root.querySelectorAll('[data-library-tab]').forEach(
      (b) =>
        (b.onclick = async () => {
          clearTimeout(runtime.saveTimer);
          if (S.tab === 'create' && !(await persist())) return;
          S.tab = b.dataset.libraryTab;
          await paint();
        }),
    );
    root.querySelector('.flyer-new').onclick = async () => {
      clearTimeout(runtime.saveTimer);
      if (!(await persist())) return;
      const d = createDesign();
      d.bgColor = '#ffffff';
      openDesign(d);
      S.saveMessage = 'Nova arte';
      S.tool = 'text';
      await paint();
    };
    if (S.tab === 'gallery') {
      await ensureCatalog();
      if (editorDisposed || !root.isConnected || viewVersion !== runtime.renderVersion) return;
      let starting = false;
      galleryCleanup = renderSceneGallery(root.querySelector('.flyer-view'), {
        catalog,
        onChoose: async (design) => {
          if (starting) return;
          starting = true;
          const scope = getDataContext(),
            route = location.hash;
          try {
            clearTimeout(runtime.saveTimer);
            if (S.saveMessage === 'Alterações pendentes' && !(await persist())) return;
            if (
              editorDisposed ||
              !root.isConnected ||
              viewVersion !== runtime.renderVersion ||
              S.tab !== 'gallery' ||
              route !== location.hash ||
              scope?.companyId !== getDataContext()?.companyId ||
              scope?.user?.id !== getDataContext()?.user?.id
            )
              return;
            openDesign(design);
            S.tool = 'text';
            S.saveMessage = 'Alterações pendentes';
            scheduleSave();
            await paint();
            message('Prévia pronta. Clique na descrição ou no preço para editar sua oferta.');
          } finally {
            starting = false;
          }
        },
      });
      return;
    }
    if (S.tab !== 'create') {
      const libraryTab = S.tab;
      libraryController = renderDesignLibrary(root.querySelector('.flyer-view'), {
        status: libraryTab,
        onError: (error) => message(error.message, true),
        onOpen: async (row) => {
          clearTimeout(runtime.saveTimer);
          if (!(await persist())) return;
          const design = await getDesign(row.id);
          if (editorDisposed || !root.isConnected || viewVersion !== runtime.renderVersion) return;
          openDesign(design);
          await paint();
        },
        onDuplicate: async (row) => {
          clearTimeout(runtime.saveTimer);
          if (!(await persist())) return;
          const original = await getDesign(row.id);
          if (editorDisposed || !root.isConnected || viewVersion !== runtime.renderVersion) return;
          const design = clone(original);
          design.id = newId();
          design.title += ' · cópia';
          design.status = 'draft';
          design.createdAt = new Date().toISOString();
          openDesign(design);
          scheduleSave();
          await paint();
        },
        beforeDelete: async () => {
          clearTimeout(runtime.saveTimer);
          await runtime.saveQueue.catch(() => {});
        },
        onDeleted: (row) => {
          if (row.id === S.design.id) {
            const fresh = createDesign();
            fresh.bgColor = '#ffffff';
            openDesign(fresh);
            S.tab = libraryTab;
          }
          message('Arte excluída.');
        },
      });
      return;
    }
    root.querySelector('.flyer-view').innerHTML = studioMarkup(S);
    if (onBack) root.querySelector('.flyer-finish').hidden = true;
    fullscreenCleanup = bindStudioViewport(root, { renderer, state: S, mutate });
    root.querySelector('#flyer-title').onchange = (e) => mutate((d) => (d.title = e.target.value), { panel: false });
    root.querySelector('.flyer-undo').onclick = () => {
      S.design = S.history.undo();
      S.selection = null;
      scheduleSave();
      refreshToolbar();
      renderPanel();
      draw();
    };
    root.querySelector('.flyer-redo').onclick = () => {
      S.design = S.history.redo();
      S.selection = null;
      scheduleSave();
      refreshToolbar();
      renderPanel();
      draw();
    };
    root.querySelector('.flyer-save').onclick = async () => {
      clearTimeout(runtime.saveTimer);
      await persist(S.design, { force: true });
    };
    root.querySelector('.flyer-export').onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      button.textContent = 'Exportando…';
      try {
        const blob = await createPngBlob(clone(S.design));
        downloadBlob(blob, safeName(S.design.title) + '.png');
        message(`PNG pronto: ${S.design.width} × ${S.design.height} pixels.`);
      } catch (error) {
        message(error.message, true);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = 'Baixar PNG';
        }
      }
    };
    bindFinishButton(root.querySelector('.flyer-finish'), {
      state: S, runtime, persist, status, message, sessionKey, paint,
      isCurrent: () => !editorDisposed && root.isConnected && viewVersion === runtime.renderVersion,
    });
    root.querySelectorAll('[data-tool]').forEach(
      (b) =>
        (b.onclick = () => {
          S.tool = b.dataset.tool;
          renderPanel();
        }),
    );
    root.querySelector('.flyer-settings').onclick = () => {
      settingsCleanup?.();
      const designId = S.design.id;
      settingsCleanup = openDocumentSettings({
        design: clone(S.design),
        onApply: (next) => {
          if (editorDisposed || !root.isConnected || S.design.id !== designId || sessionKey() !== editorScope)
            return false;
          const applied = update(next);
          if (applied) message('Configurações da arte atualizadas.');
          return applied;
        },
      });
    };
    renderPanel();
    refreshToolbar();
    await bindCanvas();
    if (!root.isConnected || viewVersion !== runtime.renderVersion) return;
    resizeObserver = new ResizeObserver(() => {
      if (!root.isConnected) {
        resizeObserver.disconnect();
        return;
      }
      draw();
    });
    resizeObserver.observe(root.querySelector('.flyer-stage'));
    await draw();
  };
  watchFlyerProducts(root, async () => {
    if (editorDisposed) return;
    if (!catalogReady && S.tab !== 'gallery') return;
    const token = ++catalogLoadVersion,
      scope = getDataContext(),
      fresh = await repository.listProductMetadata();
    if (
      editorDisposed ||
      !root.isConnected ||
      token !== catalogLoadVersion ||
      scope?.companyId !== getDataContext()?.companyId ||
      scope?.user?.id !== getDataContext()?.user?.id
    )
      return;
    loadCatalogPhoto.clear();
    catalog.splice(0, catalog.length, ...fresh);
    if (S.tab === 'gallery') {
      await paint();
      return;
    }
    if (S.tab === 'create' && selected()?.type === 'product') {
      const control = root.querySelector('.flyer-replace-product');
      if (control && !control.disabled) {
        const value = control.value;
        control.innerHTML =
          '<option value="">Escolher no catálogo…</option>' +
          catalog
            .map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`)
            .join('');
        control.value = catalog.some((product) => product.id === value) ? value : '';
      }
    }
  });
  watchFlyerLibrary(root, () => libraryController?.refresh());
  await paint();
}

clearFlyersOnSessionChange(() => {
  runtime.sessionRevision++;
  clearTimeout(runtime.saveTimer);
  S.cleanup?.();
  const fresh = createDesign();
  fresh.bgColor = '#ffffff';
  openDesign(fresh);
  S.tab = 'gallery';
  S.tool = 'text';
});
