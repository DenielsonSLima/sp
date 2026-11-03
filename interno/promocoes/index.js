import { renderProducts } from "./views/products.js";
import { renderPrint } from "./views/print.js";
import { clearCampaignDraftsOnContextChange } from "./realtime.js";
import { loadCampaignEditor, loadCampaignDetail } from "./queries.js";
import { renderCampaignList } from "./views/list.js";
import { getDataContext } from "./services.js";
let stopRealtime, productSaver;
import { heading, escapeHtml as esc } from "../../shared/ui.js";
import { campaignStore, localToday } from "./state.js";
const filters = { query: "", start: "", end: "", tab: "active", page: 1 };
let createDraft = { name: "", start: localToday(), end: localToday(), notes: "" };
let products = [],
  urls = [],
  exportVersion = 0,
  viewVersion = 0;
const rawDrafts = new Map();
const draftsFor = (id) => {
  if (!rawDrafts.has(id)) rawDrafts.set(id, { metadata: null, product: {}, prices: {}, names: {}, print: {} });
  return rawDrafts.get(id);
};
const date = (v) => v.split("-").reverse().join("/");
const chrome = (actions = "") => {
  const title = heading("OFERTAS E DIVULGAÇÃO", "Promoções");
  return `<link rel="stylesheet" href="./interno/cadastros/modelos-cartaz/styles.css"><link rel="stylesheet" href="./interno/promocoes/styles.css">${actions ? `<div class="page-heading-actions">${title}${actions}</div>` : title}`;
};
const release = () => {
  exportVersion++;
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls = [];
};
export async function render(root) {
  const campaignId = location.hash.split("/")[1];
  if (campaignId) await renderDetail(root, campaignId);
  else renderList(root);
}
function renderList(root) {
  viewVersion++;
  stopRealtime?.();
  history.replaceState(null, "", "#promocoes");
  release();
  stopRealtime = renderCampaignList(root, {
    filters, chrome,
    onOpen: (id) => renderDetail(root, id),
    onCreate: () => renderCreate(root),
  });
}
function renderCreate(root) {
  viewVersion++;
  stopRealtime?.();
  release();
  root.innerHTML = `${chrome()}<nav class="campaign-breadcrumb"><button class="campaign-back" type="button">Promoções</button><span>/ Nova campanha</span></nav><form class="card campaign-create"><h2>Criar campanha</h2><div class="campaign-fields"><label class="full">Nome da campanha<input name="name" required maxlength="100" value="${esc(createDraft.name)}" placeholder="Ex.: Ofertas da semana"></label><label>Data inicial<input name="start" type="date" required value="${createDraft.start}"></label><label>Data final<input name="end" type="date" required value="${createDraft.end}"></label><label class="full">Anotações<textarea name="notes" maxlength="4000" rows="4" placeholder="Informações para organizar a campanha">${esc(createDraft.notes)}</textarea></label></div><div class="campaign-actions"><button class="button primary" type="submit">Criar e adicionar produtos</button><button class="button secondary campaign-cancel" type="button">Voltar</button></div><p class="campaign-status" role="status"></p></form>`;
  const form = root.querySelector("form");
  form.oninput = () => {
    createDraft = Object.fromEntries(new FormData(form));
  };
  root.querySelector(".campaign-back").onclick = root.querySelector(".campaign-cancel").onclick = () =>
    renderList(root);
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const campaign = await campaignStore.create(Object.fromEntries(new FormData(form)));
      createDraft = { name: "", start: localToday(), end: localToday(), notes: "" };
      renderDetail(root, campaign.id);
    } catch (error) {
      root.querySelector(".campaign-status").textContent = error.message;
    }
  };
  form.elements.name.focus();
}
async function renderDetail(root, campaignId, tab = "products") {
  const token = ++viewVersion,
    scope = getDataContext();
  stopRealtime?.();
  history.replaceState(null, "", `#promocoes/${campaignId}`);
  root.innerHTML = `${chrome()}<p role="status">Carregando campanha…</p>`;
  try {
    const [loadedProducts, campaign] = await Promise.all([loadCampaignEditor(), loadCampaignDetail(campaignId)]);
    if (!campaign) throw Error("Campanha não encontrada. Atualize a lista.");
    products = loadedProducts;
  } catch (error) {
    if (!root.isConnected || token !== viewVersion || location.hash !== `#promocoes/${campaignId}`) return;
    root.innerHTML = `${chrome()}<p class="campaign-status" role="alert">${esc(error.message)}</p><button class="button secondary campaign-back" type="button">← Voltar</button>`;
    root.querySelector(".campaign-back").onclick = () => renderList(root);
    return;
  }
  if (
    !root.isConnected ||
    token !== viewVersion ||
    location.hash !== `#promocoes/${campaignId}` ||
    scope?.companyId !== getDataContext()?.companyId ||
    scope?.user?.id !== getDataContext()?.user?.id
  )
    return;
  history.replaceState(null, "", `#promocoes/${campaignId}`);
  release();
  let campaign = campaignStore.get(campaignId);
  const raw = draftsFor(campaignId);
  root.innerHTML = `${chrome()}<nav class="campaign-breadcrumb"><button class="campaign-back" type="button">Promoções</button><span>/</span><strong>${esc(campaign.name)}</strong></nav><div class="campaign-toolbar"><div><h2 class="campaign-title">${esc(campaign.name)}</h2><p class="campaign-period">${date(campaign.start)} a ${date(campaign.end)}</p></div><button class="button secondary campaign-back-button" type="button">← Voltar</button></div><details class="card campaign-metadata"><summary>Dados e anotações da campanha</summary><form class="campaign-fields"><label class="full">Nome<input name="name" maxlength="100" required value="${esc(campaign.name)}"></label><label>Data inicial<input name="start" type="date" required value="${campaign.start}"></label><label>Data final<input name="end" type="date" required value="${campaign.end}"></label><label class="full">Anotações<textarea name="notes" maxlength="4000" rows="3">${esc(campaign.notes)}</textarea></label></form></details><div class="campaign-tabs module-tabs" role="tablist" aria-label="Etapas da campanha"><button data-detail-tab="products" type="button" role="tab" aria-selected="${tab === "products"}">Produtos</button><button data-detail-tab="print" type="button" role="tab" aria-selected="${tab === "print"}">Impressão de cards</button></div><p class="campaign-status" role="status" aria-live="polite"></p><div class="campaign-detail-body"></div>`;
  const status = (text) => { if (root.isConnected && token === viewVersion) root.querySelector(".campaign-status").textContent = text; };
  const leave = async (next) => {
    try {
      await productSaver?.flush();
      productSaver?.dispose();
      productSaver = null;
      next();
    } catch (error) { status(error.message); }
  };
  const back = () => leave(() => renderList(root));
  root.querySelector(".campaign-back").onclick = back;
  root.querySelector(".campaign-back-button").onclick = back;
  root
    .querySelectorAll("[data-detail-tab]")
    .forEach((b) => (b.onclick = () => leave(() => renderDetail(root, campaignId, b.dataset.detailTab))));
  const metadata = root.querySelector(".campaign-metadata form");
  if (raw.metadata)
    for (const [key, value] of Object.entries(raw.metadata))
      if (metadata.elements[key]) metadata.elements[key].value = value;
  metadata.oninput = () => {
    raw.metadata = Object.fromEntries(new FormData(metadata));
    release();
    root.querySelector(".campaign-generated")?.replaceChildren();
  };
  metadata.onsubmit = (e) => e.preventDefault();
  metadata.onchange = async () => {
    try {
      campaign = await campaignStore.update(campaignId, Object.fromEntries(new FormData(metadata)));
      raw.metadata = null;
      root.querySelector(".campaign-title").textContent = campaign.name;
      root.querySelector(".campaign-breadcrumb strong").textContent = campaign.name;
      root.querySelector(".campaign-period").textContent = `${date(campaign.start)} a ${date(campaign.end)}`;
      release();
      root.querySelector(".campaign-generated")?.replaceChildren();
      status("Alterações salvas.");
    } catch (error) {
      status(error.message);
    }
  };
  const body = root.querySelector(".campaign-detail-body");
  if (tab === "products") productSaver = renderProducts(body, campaignId, status, { products, raw, release });
  else renderPrint(body, root, campaignId, status, { draftsFor, release, getExportVersion: () => exportVersion });
  if (raw.metadata || Object.keys(raw.names).length || Object.keys(raw.prices).length || Object.keys(raw.print).length)
    status("Há alterações não salvas preservadas nos campos. Revise e corrija antes de exportar.");
}

clearCampaignDraftsOnContextChange(() => {
  viewVersion++;
  products = [];
  stopRealtime?.();
  productSaver?.dispose();
  productSaver = null;
  rawDrafts.clear();
  createDraft = { name: "", start: localToday(), end: localToday(), notes: "" };
});
