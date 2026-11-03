import { escapeHtml as esc } from "../../../shared/ui.js";
import { templates, dimensionLabel, posterMarkup, paperStyle } from "../../cadastros/modelos-cartaz/model.js";
import { campaignStore } from "../state.js";
const money = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const optionTemplate = (t) => `<option value="${esc(t.id)}">${esc(t.name)} · ${dimensionLabel(t)}</option>`;
export function renderPrint(body, root, campaignId, status, { draftsFor, release, getExportVersion }) {
  const campaign = campaignStore.get(campaignId),
    raw = draftsFor(campaignId);
  body.innerHTML = `<div class="campaign-toolbar"><div><h2>Impressão de cards</h2><p>Escolha modelo, quantidade e papel. Cada formato gera um arquivo PDF separado.</p></div><a href="#cadastros/modelos-cartaz" class="button secondary">Modelos de cartaz →</a></div><section class="campaign-print-items">${
    campaign.items
      .map((savedItem) => {
        const item = { ...savedItem, ...(raw.print[savedItem.id] || {}) };
        const options = templates.some((t) => t.id === item.templateId)
          ? templates
          : [item.templateSnapshot, ...templates];
        return `<article class="card campaign-print-row" data-item="${item.id}"><div class="campaign-print-name"><strong>${esc(item.name)}</strong><span>${money(item.cents)} / ${item.unit}</span></div><label>Modelo<select data-setting="templateId">${options.map((t) => optionTemplate(t).replace("<option ", `<option ${t.id === item.templateId ? "selected" : ""} `)).join("")}</select></label><label>Quantidade<input data-setting="quantity" inputmode="numeric" value="${esc(item.quantity)}" aria-label="Quantidade de ${esc(item.name)}"></label><label>Formato de impressão<select data-setting="printLayout"><option value="individual" ${item.printLayout === "individual" ? "selected" : ""}>Folha individual do modelo</option><option value="two-a4" ${item.printLayout === "two-a4" ? "selected" : ""}>2 por A4 paisagem · cartazes retrato</option></select></label><div class="campaign-print-buttons"><button type="button" class="button secondary view-campaign-poster">Ver cartaz</button><button type="button" class="button secondary refresh-campaign-model">Atualizar modelo</button></div><p class="campaign-row-save" role="status">${dimensionLabel(item.templateSnapshot)} · modelo salvo no item</p></article>`;
      })
      .join("") ||
    '<div class="card campaign-empty"><h2>Nenhum produto para imprimir.</h2><p>Adicione produtos na aba Produtos.</p></div>'
  }</section><div class="campaign-export-controls"><button class="button secondary preview-campaign-pdfs" type="button" ${campaign.items.length ? "" : "disabled"}>Conferir formatos</button><button class="button primary export-campaign-pdfs" type="button" ${campaign.items.length ? "" : "disabled"}>PDF</button></div><p class="campaign-print-help">Uma folha por cartaz no formato individual. Em 2 por A4, dois cartazes em retrato ficam lado a lado na folha A4 paisagem, sem girar ou esticar a arte. Use escala 100% e o papel indicado em cada arquivo.</p><div class="campaign-generated"></div><dialog class="campaign-poster-dialog" aria-labelledby="campaign-poster-title"><div class="campaign-toolbar"><h2 id="campaign-poster-title">Prévia do cartaz</h2><button type="button" class="button secondary close-poster-preview">Fechar</button></div><div class="campaign-poster-content"></div></dialog>`;
  body.querySelectorAll(".campaign-print-row").forEach((row) => {
    row.querySelectorAll("[data-setting]").forEach((input) => {
      input.oninput = () => {
        raw.print[row.dataset.item] ??= {};
        raw.print[row.dataset.item][input.dataset.setting] = input.value;
        release();
        body.querySelector(".campaign-generated").replaceChildren();
      };
      input.onchange = async () => {
        raw.print[row.dataset.item] ??= {};
        raw.print[row.dataset.item][input.dataset.setting] = input.value;
        try {
          const next = await campaignStore.updateItem(campaignId, row.dataset.item, {
            [input.dataset.setting]: input.value,
          });
          const updated = next.items.find((i) => i.id === row.dataset.item);
          input.value = String(updated[input.dataset.setting]);
          delete raw.print[row.dataset.item][input.dataset.setting];
          if (!Object.keys(raw.print[row.dataset.item]).length) delete raw.print[row.dataset.item];
          row.querySelector(".campaign-row-save").textContent = `Salvo · ${dimensionLabel(updated.templateSnapshot)}`;
          release();
          body.querySelector(".campaign-generated").replaceChildren();
          status("Configuração salva automaticamente.");
        } catch (e) {
          row.querySelector(".campaign-row-save").textContent = e.message;
          status("Alteração não salva. Corrija o campo para continuar.");
        }
      };
    });
    row.querySelector(".refresh-campaign-model").onclick = async () => {
      try {
        const selected = row.querySelector("[data-setting=templateId]").value;
        await campaignStore.updateItem(campaignId, row.dataset.item, { templateId: selected });
        release();
        body.querySelector(".campaign-generated").replaceChildren();
        row.querySelector(".campaign-row-save").textContent = "Versão atual do modelo aplicada e salva.";
      } catch (e) {
        row.querySelector(".campaign-row-save").textContent = e.message;
      }
    };
    row.querySelector(".view-campaign-poster").onclick = () => {
      const latest = campaignStore.get(campaignId),
        item = latest.items.find((i) => i.id === row.dataset.item),
        t = item.templateSnapshot;
      body.querySelector(".campaign-poster-content").innerHTML =
        `<div class="poster-mini-paper campaign-full-preview" style="${paperStyle(t)};--mini-width:360px"><div class="poster-mini-content">${posterMarkup({ ...item, start: latest.start, end: latest.end }, t)}</div></div>`;
      body.querySelector("dialog").showModal();
      body.querySelector(".close-poster-preview").focus();
    };
  });
  body.querySelector(".close-poster-preview").onclick = () => body.querySelector("dialog").close();
  const checkUnsaved = () => {
    if (Object.keys(raw.names).length)
      throw Error("Há nomes de cartazes não salvos. Volte à aba Produtos e corrija os campos antes de exportar.");
    if (Object.keys(raw.prices).length)
      throw Error("Há preços de produtos não salvos. Volte à aba Produtos e corrija os campos antes de exportar.");
    const saved = campaignStore.get(campaignId),
      meta = Object.fromEntries(new FormData(root.querySelector(".campaign-metadata form")));
    for (const key of ["name", "start", "end", "notes"])
      if (meta[key].trim() !== saved[key])
        throw Error("Há dados da campanha não salvos. Corrija o nome e o período antes de exportar.");
    for (const row of body.querySelectorAll(".campaign-print-row")) {
      const item = campaignStore.get(campaignId).items.find((i) => i.id === row.dataset.item);
      for (const control of row.querySelectorAll("[data-setting]"))
        if (String(item[control.dataset.setting]) !== control.value)
          throw Error("Há uma configuração não salva. Corrija os campos antes de exportar.");
    }
  };
  body.querySelector(".preview-campaign-pdfs").onclick = async () => {
    try {
      checkUnsaved();
      const token = getExportVersion();
      const { planCampaignPdfs } = await import("../pdf.js");
      if (!body.isConnected || token !== getExportVersion()) return;
      const plan = planCampaignPdfs(campaignStore.get(campaignId));
      showPlan(body, plan);
      status("Formatos conferidos. Cada grupo será exportado em um PDF.");
    } catch (e) {
      if (body.isConnected) status(e.message);
    }
  };
  body.querySelector(".export-campaign-pdfs").onclick = async () => {
    const button = body.querySelector(".export-campaign-pdfs");
    try {
      checkUnsaved();
      button.disabled = true;
      const token = getExportVersion();
      const { openCampaignPdfDialog } = await import("../pdf-dialog.js");
      if (!body.isConnected || token !== getExportVersion()) return;
      await openCampaignPdfDialog(body, campaignStore.get(campaignId), button);
    } catch (e) {
      if (body.isConnected) status(e.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}

function showPlan(body, plan) {
  body.querySelector(".campaign-generated").innerHTML =
    `<h3>Arquivos por formato</h3>${plan.map((group) => `<article class="card campaign-format-card"><strong>${esc(group.formatLabel)}</strong><p>${group.pages.length} folha(s) · ${group.count} cartaz(es) · ${group.widthMm} × ${group.heightMm} mm</p><div class="campaign-format-paper" style="--format-ratio:${group.widthMm}/${group.heightMm}">${group.pages[0].map((p) => `<div class="campaign-format-slot" style="left:${(p.xMm / group.widthMm) * 100}%;top:${(p.yMm / group.heightMm) * 100}%;width:${(p.widthMm / group.widthMm) * 100}%;height:${(p.heightMm / group.heightMm) * 100}%;${paperStyle(p.offer.templateSnapshot)}"><div class="poster-mini-content">${posterMarkup(p.offer, p.offer.templateSnapshot)}</div></div>`).join("")}</div><p class="campaign-format-caption">Prévia da primeira folha deste arquivo. O PDF contém todas as ${group.pages.length} folha(s).</p></article>`).join("")}`;
}
