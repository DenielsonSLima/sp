import { getDataContext, subscribeResource } from '../../../shared/data/api.js';
import { watchResources } from '../../../shared/data/resource-watch.js';
import { generateFlyerPages } from '../generator/index.js';
import { newId } from '../model.js';
import { publicationId, groupPublicationSummaries } from '../publication.js';
import { saveDesign, getDesign, listDesignSummaries } from '../storage.js';
import { renderDesign } from '../renderer.js';
import { renderEditor } from '../editor.js';
import { createPngBlob, downloadBlob } from '../export.js';
import { safeName } from '../editor/presentation.js';
import { createFlyerPdf } from './pdf.js';
import { campaignChoices, readCampaignWithPhotos, selectedPhotos } from './data.js';
import { workspaceMarkup } from './view.js';

export async function renderWorkspace(root) {
  const context = getDataContext(), scope = JSON.stringify([context?.companyId, context?.user?.id]);
  const state = { tab: 'create', campaigns: [], campaign: null, products: new Map(), photoChoices: new Map(),
    options: { templateId: 'grid-6', themeId: 'povo', formatId: 'portrait' }, pages: [], pageIndex: 0,
    groups: [], saved: false, busy: false, message: '', error: false, sourceChanged: false, optionsChanged: false };
  let active = true, revision = 0, editing = false;
  const current = () => active && root.isConnected && scope === JSON.stringify([getDataContext()?.companyId, getDataContext()?.user?.id]);
  const ensure = () => { if (!current()) throw Error('A tela ou a sessão mudou. Abra o encarte novamente.'); };
  const feedback = (text, error = false) => {
    state.message = text; state.error = error;
    const node = root.querySelector('.fw-feedback');
    if (current() && node) { node.textContent = text; node.classList.toggle('error', error); }
  };
  async function paint() {
    if (!current() || editing) return;
    const version = ++revision;
    root.classList.remove('flyer-editing');
    root.innerHTML = workspaceMarkup(state);
    bind();
    const canvas = root.querySelector('.fw-canvas'), page = state.pages[state.pageIndex];
    if (canvas && page) {
      try { await renderDesign(canvas, page, { scale: Math.min(1, 720 / Math.max(page.width, page.height)) }); }
      catch (error) { if (current() && revision === version) feedback(error.message, true); }
    }
  }
  async function run(action) {
    if (!current() || state.busy) return;
    state.busy = true;
    await paint();
    try { await action(); }
    catch (error) { if (current()) feedback(error.message, true); }
    finally { if (current()) { state.busy = false; await paint(); } }
  }
  async function refreshGroups() {
    const rows = await listDesignSummaries();
    ensure();
    state.groups = groupPublicationSummaries(rows);
  }
  async function selectCampaign(id) {
    feedback('Carregando a promoção e as fotos…');
    if (!id) {
      state.campaign = null; state.products.clear(); state.pages = []; state.saved = false;
      state.pageIndex = 0; state.optionsChanged = false; feedback(''); return;
    }
    const loaded = await readCampaignWithPhotos(id, current);
    ensure();
    state.campaign = loaded.campaign;
    state.products = loaded.products;
    state.photoChoices.clear();
    state.pages = []; state.pageIndex = 0; state.saved = false;
    state.optionsChanged = false; state.sourceChanged = false;
    feedback(state.campaign.items.length ? '' : 'Esta promoção ainda não tem produtos. Adicione os itens em Promoções.');
  }
  async function generate() {
    if (!state.campaign) return;
    feedback('Preparando as fotos e montando as páginas…');
    // Re-read the saved promotion; a Realtime event never overwrites an edited document.
    const loaded = await readCampaignWithPhotos(state.campaign.id, current);
    ensure();
    const photos = await selectedPhotos(loaded.products, state.photoChoices, current);
    ensure();
    const company = context.companies?.find(row => row.id === context.companyId);
    const generated = generateFlyerPages(loaded.campaign, { ...state.options, photos, storeName: company?.name });
    const groupId = newId();
    state.pages = generated.map((page, pageIndex) => ({ ...page, id: publicationId(groupId, pageIndex), publication: {
      kind: 'campaign', groupId, campaignId: loaded.campaign.id, campaignVersion: loaded.campaign._version,
      pageIndex, pageCount: generated.length, ...state.options,
    } }));
    state.campaign = loaded.campaign;
    state.products = loaded.products;
    state.pageIndex = 0;
    state.saved = false;
    state.sourceChanged = false;
    state.optionsChanged = false;
    const missing = loaded.campaign.items.filter(item => !photos.get(item.productId)).length;
    feedback(`${generated.length} página${generated.length > 1 ? 's' : ''} pronta${generated.length > 1 ? 's' : ''}.${missing ? ` ${missing} produto(s) sem foto cadastrada.` : ' Revise e salve seu encarte.'}`);
  }
  async function savePages() {
    if (state.saved) { feedback('Este encarte já está salvo.'); return; }
    let confirmed = state.pages.filter(page => page._version && page.status === 'created').length;
    try {
      for (let index = 0; index < state.pages.length; index++) {
        ensure();
        if (state.pages[index]._version && state.pages[index].status === 'created') continue;
        feedback(`Salvando página ${index + 1} de ${state.pages.length}…`);
        const saved = await saveDesign({ ...state.pages[index], status: 'created' });
        ensure();
        state.pages[index] = saved;
        confirmed++;
      }
    } catch (error) {
      throw Error(`${error.message} ${confirmed} de ${state.pages.length} páginas salvas. Tente salvar novamente para concluir.`);
    }
    state.saved = true;
    await refreshGroups();
    feedback('Encarte salvo. Todas as páginas estão disponíveis em Encartes salvos.');
  }
  async function openGroup(id) {
    const group = state.groups.find(row => row.groupId === id);
    if (!group) throw Error('Encarte não encontrado. Atualize a lista.');
    const pages = [];
    for (const row of group.pages) {
      ensure();
      const page = await getDesign(row.id);
      ensure();
      if (page.publication?.kind !== 'campaign' || page.publication.groupId !== id ||
          page.id !== publicationId(id, page.publication.pageIndex)) throw Error('Uma página não pertence a este encarte.');
      pages.push(page);
    }
    const count = pages[0]?.publication.pageCount;
    const complete = pages.length === count && pages.every((page, index) => page.publication.pageIndex === index && page.publication.pageCount === count);
    if (!complete) throw Error('Este encarte está incompleto. Conclua o salvamento ou gere uma nova versão pela promoção.');
    state.pages = pages;
    state.pageIndex = 0;
    state.saved = true;
    state.campaign = null;
    state.products.clear(); state.photoChoices.clear();
    const publication = pages[0].publication;
    state.options = { templateId: publication.templateId, themeId: publication.themeId, formatId: publication.formatId };
    state.optionsChanged = false; state.sourceChanged = false; state.tab = 'create';
    feedback('Encarte salvo aberto. Você pode editar cada página ou baixar o conjunto.');
  }
  async function editPage() {
    await savePages();
    ensure();
    const index = state.pageIndex, page = await getDesign(state.pages[index].id);
    ensure();
    editing = true;
    root.innerHTML = '<div class="fw-editor-host"></div>';
    const host = root.firstElementChild;
    await renderEditor(host, { initialDesign: page, onBack: async () => {
      if (!current()) return;
      state.pages[index] = await getDesign(page.id);
      ensure();
      editing = false;
      state.saved = true;
      await refreshGroups();
      await paint();
    } });
  }
  async function action(name) {
    if (!state.pages.length) return;
    if (name === 'save') return savePages();
    if (name === 'edit') return editPage();
    if (name === 'previous' || name === 'next') {
      state.pageIndex = Math.max(0, Math.min(state.pages.length - 1, state.pageIndex + (name === 'next' ? 1 : -1)));
      return;
    }
    if (name === 'png') {
      const page = state.pages[state.pageIndex], blob = await createPngBlob(page);
      ensure(); downloadBlob(blob, safeName(page.title) + '.png'); feedback('PNG pronto para download.');
    }
    if (name === 'pdf') {
      const blob = await createFlyerPdf(state.pages, { isCurrent: current,
        onProgress: (done, total) => feedback(`Preparando PDF: ${done} de ${total} páginas…`) });
      ensure(); downloadBlob(blob, safeName(state.campaign?.name || state.pages[0].title) + '.pdf');
      feedback('PDF pronto com todas as páginas do encarte.');
    }
  }
  function bind() {
    root.querySelectorAll('[data-fw-tab]').forEach(button => { button.onclick = () => run(async () => {
      state.tab = button.dataset.fwTab;
      if (state.tab === 'saved') await refreshGroups();
      feedback('');
    }); });
    const select = root.querySelector('#fw-campaign');
    if (select) select.onchange = () => run(() => selectCampaign(select.value));
    const changed = () => { state.optionsChanged = state.pages.length > 0; feedback(''); void paint(); };
    for (const [selector, key] of [['#fw-template', 'templateId'], ['#fw-format', 'formatId']]) {
      const control = root.querySelector(selector);
      if (control) control.onchange = () => { state.options[key] = control.value; changed(); };
    }
    root.querySelectorAll('[data-fw-theme]').forEach(button => { button.onclick = () => {
      if (state.busy) return; state.options.themeId = button.dataset.fwTheme; changed();
    }; });
    root.querySelectorAll('[data-fw-photo]').forEach(control => { control.onchange = () => {
      state.photoChoices.set(state.campaign.items[Number(control.dataset.fwPhoto)].productId, Number(control.value)); changed();
    }; });
    const form = root.querySelector('.fw-form');
    if (form) form.onsubmit = event => { event.preventDefault(); void run(generate); };
    root.querySelectorAll('[data-fw-action]').forEach(button => { button.onclick = () => run(() => action(button.dataset.fwAction)); });
    root.querySelectorAll('[data-fw-open]').forEach(button => { button.onclick = () => run(() => openGroup(button.dataset.fwOpen)); });
  }
  const stopCampaigns = watchResources(root, ['campaigns', 'products'], async () => {
    if (state.pages.length) state.sourceChanged = true;
    if (!current() || state.busy || editing) return;
    state.campaigns = await campaignChoices(current);
    ensure();
    if (state.pages.length) state.sourceChanged = true;
    await paint();
  });
  const stopLibrary = watchResources(root, ['flyers'], async () => {
    if (!current() || state.busy || editing || state.tab !== 'saved') return;
    await refreshGroups(); await paint();
  });
  const stopSession = subscribeResource('flyers', () => {
    if (current()) return;
    state.pages = []; state.products.clear(); state.campaign = null;
    if (root.isConnected) root.replaceChildren();
  });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) { active = false; stopCampaigns(); stopLibrary(); stopSession(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  await run(async () => { feedback('Carregando promoções…'); state.campaigns = await campaignChoices(current); ensure(); feedback(''); });
}
