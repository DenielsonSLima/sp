import { getDataContext, subscribeResource } from '../../../shared/data/api.js';
import { watchResources } from '../../../shared/data/resource-watch.js';
import { getDesign, listDesignSummaries, saveDesign } from '../storage.js';
import { renderDesign } from '../renderer.js';
import { previewRasterScale, previewContentWidth } from '../preview-resolution.js';
import { renderEditor } from '../editor.js';
import { MAX_JSON_BYTES, MAX_IMAGE_BYTES } from '../model.js';
import {
  FLYER_MODEL_PRESETS, createBlankFlyerModel, duplicateFlyerModel,
  isFlyerModel, modelSlotCount, validateFlyerModel,
} from './model.js';
import { modelLibraryMarkup, modelCreationMarkup } from './view.js';
import { bindFlyerNavigation } from '../navigation.js';

async function readBackgroundImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('Escolha uma imagem PNG, JPG ou WebP para o fundo.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('A imagem de fundo deve ter até 8 MB.');
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('Não foi possível ler a imagem de fundo.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const value = new Image();
    value.onload = () => resolve(value);
    value.onerror = () => reject(Error('O arquivo não contém uma imagem válida.'));
    value.src = src;
  });
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16000000)
    throw Error('Use uma imagem com até 4.096 pixels por lado e 16 megapixels.');
  return src;
}

function withBackground(design, src, automaticHeading) {
  if (!src) return design;
  const headerIds = ['nome-da-promocao', 'validade-da-promocao', 'numero-da-pagina'];
  design.elements = design.elements.filter(element => /^slot-\d+-(foto|nome|preco|unidade)$/.test(element.id) ||
    (automaticHeading && headerIds.includes(element.id)));
  design.elements.unshift({ id: 'fundo-importado', type: 'image', label: 'Imagem de fundo', src,
    x: 0, y: 0, width: design.width, height: design.height, fit: 'cover', locked: true });
  return validateFlyerModel(design);
}

export async function renderModels(root, { campaignId, tab = 'ready' } = {}) {
  const initialContext = getDataContext();
  const scope = JSON.stringify([initialContext?.companyId, initialContext?.user?.id]);
  const promotion = campaignId || new URLSearchParams(location.hash.split('?')[1] || '').get('promocao');
  const state = { tab, campaignId: promotion, category: '', filterCategory: '', query: '', presets: FLYER_MODEL_PRESETS, models: [], busy: false, message: '', error: false };
  const presetDesigns = new Map(FLYER_MODEL_PRESETS.map(preset => [preset.id, createBlankFlyerModel({ presetId: preset.id })]));
  let active = true, editing = false, revision = 0, previewObserver, dialog;
  const current = () => active && root.isConnected && scope === JSON.stringify([getDataContext()?.companyId, getDataContext()?.user?.id]);
  const ensure = () => { if (!current()) throw Error('A sessão ou a tela mudou. Abra Modelos novamente.'); };
  const feedback = (message, error = false) => {
    state.message = message; state.error = error;
    const node = root.querySelector('.fm-feedback');
    if (current() && node) { node.textContent = message; node.classList.toggle('error', error); }
  };
  async function refresh() {
    const rows = await listDesignSummaries();
    ensure();
    state.models = rows.filter(isFlyerModel).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async function preview(canvas, version) {
    const key = canvas.dataset.fmPreview, ready = key.startsWith('preset:');
    const card = canvas.closest('.fm-category-sample, .fm-card'), label = card.querySelector('.fm-preview-status');
    const slots = card.querySelector('.fm-card-slots');
    try {
      const row = state.models.find(model => model.id === key);
      const design = ready ? presetDesigns.get(key.slice(7)) : await getDesign(key, { preview: true, expectedVersion: row?._version });
      if (!current() || version !== revision || !canvas.isConnected) return;
      validateFlyerModel(design);
      await renderDesign(canvas, design, { scale: previewRasterScale(design, {
        width: previewContentWidth(canvas.parentElement), height: 256,
        pixelRatio: root.ownerDocument?.defaultView?.devicePixelRatio || 1,
        minimumScale: Math.min(1, 320 / design.width),
      }) });
      if (!current() || version !== revision || !canvas.isConnected) return;
      canvas.classList.add('is-ready');
      label.hidden = true;
      if (slots) slots.textContent = `${modelSlotCount(design)} produtos por página`;
    } catch (error) {
      if (current() && version === revision && label.isConnected) {
        label.textContent = 'Prévia indisponível';
        label.title = error.message;
        if (slots) slots.textContent = 'Abra o modelo para conferir';
      }
    }
  }
  function paint() {
    if (!current() || editing) return;
    previewObserver?.disconnect();
    const version = ++revision;
    const search = root.querySelector('.fm-search input');
    const restoreSearch = search === document.activeElement;
    const selection = search?.selectionStart;
    root.classList.remove('flyer-editing');
    root.innerHTML = modelLibraryMarkup(state);
    bind();
    if (restoreSearch) {
      const input = root.querySelector('.fm-search input');
      input.focus({ preventScroll: true });
      if (selection !== null && selection !== undefined) input.setSelectionRange?.(selection, selection);
    }
    const canvases = root.querySelectorAll('[data-fm-preview]');
    if (typeof IntersectionObserver === 'function') {
      previewObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          previewObserver.unobserve(entry.target);
          void preview(entry.target, version);
        }
      }, { rootMargin: '300px' });
      canvases.forEach(canvas => previewObserver.observe(canvas));
    } else canvases.forEach(canvas => { void preview(canvas, version); });
  }
  async function run(action) {
    if (!current() || state.busy || editing) return;
    state.busy = true;
    feedback('');
    paint();
    try { await action(); }
    catch (error) { if (current()) feedback(error.message, true); }
    finally { if (current()) { state.busy = false; paint(); } }
  }
  async function resolveModel(key, { copy = false } = {}) {
    const ready = key.startsWith('preset:');
    let design;
    if (ready) {
      const presetId = key.slice(7);
      design = createBlankFlyerModel({ presetId });
    } else {
      design = await getDesign(key, { preview: true, fresh: true });
      ensure();
      validateFlyerModel(design);
      if (copy) design = duplicateFlyerModel(design);
    }
    if (ready || copy) {
      design = await saveDesign(design);
      ensure();
      await refresh();
    }
    return design;
  }
  async function openEditor(design) {
    ensure();
    previewObserver?.disconnect();
    editing = true;
    root.innerHTML = '<div class="fm-editor-host"></div>';
    try {
      await renderEditor(root.firstElementChild, { initialDesign: design, mode: 'template', onBack: async () => {
        if (!current()) return;
        editing = false;
        state.tab = 'mine'; state.query = ''; state.category = ''; state.filterCategory = '';
        await refresh();
        feedback('Modelo salvo. Você já pode usá-lo em uma promoção.');
        paint();
      } });
    } catch (error) { editing = false; throw error; }
  }
  function useModel(design) {
    ensure();
    const query = new URLSearchParams({ modelo: design.id });
    if (promotion) query.set('promocao', promotion);
    location.hash = `encartes?${query}`;
  }
  function createDialog({ backgroundFile } = {}) {
    if (!current() || state.busy) return;
    dialog?.remove();
    dialog = document.createElement('dialog');
    dialog.className = 'fm-create-dialog';
    dialog.setAttribute('aria-label', 'Criar modelo de encarte');
    dialog.innerHTML = modelCreationMarkup(FLYER_MODEL_PRESETS);
    document.body.append(dialog);
    const form = dialog.querySelector('form'), openedDialog = dialog;
    let preparing = false;
    if (backgroundFile) {
      const selection = new DataTransfer();
      selection.items.add(backgroundFile);
      form.elements.background.files = selection.files;
      form.elements.title.value = backgroundFile.name.replace(/\.[^.]+$/, '').slice(0, 100);
      form.querySelector('.fm-background-heading').hidden = false;
    }
    form.querySelector('[data-fm-cancel]').onclick = () => openedDialog.close();
    openedDialog.addEventListener('close', () => { openedDialog.remove(); if (dialog === openedDialog) dialog = null; }, { once: true });
    form.elements.background.onchange = () => {
      form.querySelector('.fm-background-heading').hidden = !form.elements.background.files.length;
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (!current() || state.busy || preparing) return;
      const values = Object.fromEntries(new FormData(form));
      const title = values.title.trim();
      if (!title) { form.elements.title.focus(); return; }
      const file = form.elements.background.files[0];
      let background = '';
      if (file) {
        preparing = true;
        form.querySelector('[type=submit]').disabled = true;
        form.querySelector('.fm-dialog-feedback').textContent = 'Preparando imagem…';
        try { background = await readBackgroundImage(file); ensure(); }
        catch (error) {
          if (openedDialog.isConnected) form.querySelector('.fm-dialog-feedback').textContent = error.message;
          return;
        } finally {
          preparing = false;
          form.querySelector('[type=submit]').disabled = false;
        }
      }
      if (!current() || !openedDialog.isConnected) return;
      const automaticHeading = form.elements.automaticHeading.checked;
      openedDialog.close();
      await run(async () => {
        feedback('Salvando o novo modelo…');
        const model = withBackground(createBlankFlyerModel({ ...values, title }), background, automaticHeading);
        const design = await saveDesign(model);
        ensure();
        await openEditor(design);
      });
    };
    openedDialog.showModal();
  }
  async function importModel(file) {
    if (!file) return;
    if (file.size > MAX_JSON_BYTES) throw Error('Escolha um modelo JSON de até 25 MB.');
    feedback('Importando modelo…');
    const text = await file.text();
    ensure();
    let raw;
    try { raw = JSON.parse(text); } catch { throw Error('O arquivo não contém um JSON válido.'); }
    const design = duplicateFlyerModel(validateFlyerModel(raw));
    const saved = await saveDesign(design);
    ensure();
    await openEditor(saved);
  }
  function bind() {
    bindFlyerNavigation(root);
    root.querySelectorAll('[data-fm-tab]').forEach(button => { button.onclick = event => {
      event.preventDefault();
      if (state.busy) return;
      state.tab = button.dataset.fmTab; state.query = ''; state.category = ''; state.filterCategory = ''; paint();
    }; });
    root.querySelectorAll('[data-fm-category]').forEach(button => { button.onclick = () => {
      if (state.busy) return;
      state.category = button.dataset.fmCategory;
      paint();
      root.querySelector('[data-fm-back]')?.focus({ preventScroll: true });
    }; });
    const back = root.querySelector('[data-fm-back]');
    if (back) back.onclick = () => {
      if (state.busy) return;
      const previous = state.category;
      state.category = '';
      paint();
      const card = [...root.querySelectorAll('[data-fm-category]')].find(button => button.dataset.fmCategory === previous);
      (card || root.querySelector('.fm-search input'))?.focus({ preventScroll: true });
    };
    root.querySelector('.fm-search input').oninput = event => {
      if (state.busy) return;
      state.query = event.target.value; paint();
    };
    const categoryFilter = root.querySelector('.fm-filter-category');
    if (categoryFilter) categoryFilter.onchange = () => {
      if (state.busy) return;
      state.filterCategory = categoryFilter.value; state.category = ''; paint();
    };
    root.querySelector('[data-fm-clear]').onclick = () => {
      if (state.busy) return;
      state.query = ''; state.filterCategory = ''; paint();
      root.querySelector('.fm-search input').focus({ preventScroll: true });
    };
    root.querySelectorAll('[data-fm-action="create"]').forEach(button => { button.onclick = createDialog; });
    root.querySelector('[data-fm-action="import"]').onclick = () => root.querySelector('.fm-import-file').click();
    root.querySelector('.fm-import-file').onchange = event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file?.type.startsWith('image/')) createDialog({ backgroundFile: file });
      else if (file) void run(() => importModel(file));
    };
    root.querySelectorAll('[data-fm-use]').forEach(button => { button.onclick = () => run(async () => useModel(await resolveModel(button.dataset.fmUse))); });
    root.querySelectorAll('[data-fm-edit]').forEach(button => { button.onclick = () => run(async () => openEditor(await resolveModel(button.dataset.fmEdit))); });
    root.querySelectorAll('[data-fm-copy]').forEach(button => { button.onclick = () => run(async () => openEditor(await resolveModel(button.dataset.fmCopy, { copy: true }))); });
  }
  const stopLibrary = watchResources(root, ['flyers'], async () => {
    if (!current() || state.busy || editing) return;
    await refresh(); paint();
  });
  const stopSession = subscribeResource('flyers', () => {
    if (current()) return;
    state.models = []; presetDesigns.clear(); dialog?.remove();
    if (root.isConnected) root.replaceChildren();
  });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      active = false; previewObserver?.disconnect(); dialog?.remove();
      stopLibrary(); stopSession(); observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  await run(async () => { feedback('Carregando seus modelos…'); await refresh(); feedback(''); });
}

export const render = renderModels;
