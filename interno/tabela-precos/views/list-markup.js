import { escapeHtml as esc } from "../../../shared/ui.js";
import { formatBRLCents } from "../../../shared/components/currency-input/index.js";

export const tabs = [["draft", "Rascunho"], ["sent", "Enviado"], ["finalized", "Finalizado"]];
const date = (value) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const money = (cents) => Number.isSafeInteger(cents) ? `R$ ${formatBRLCents(cents)}` : "Preço pendente";
export const help = (tab) => tab === "draft"
  ? "Salve quantos rascunhos precisar. Enviar coloca os itens na fila interna de impressão."
  : tab === "sent" ? "Selecione os itens para gerar PDFs agrupados por modelo. Depois da impressão, confirme a finalização."
  : "Os finalizados ficam no histórico por 90 dias; depois vão para o arquivo recuperável. Itens restaurados permanecem no histórico.";

export function listFrame(state, chrome) {
  return `${chrome()}<section class="tp-module"><div class="tp-toolbar"><div class="tp-tabs module-tabs" role="tablist" aria-label="Etapas da tabela">${tabs.map(([key, label]) => `<button type="button" role="tab" data-tab="${key}">${label}<span>—</span></button>`).join("")}</div><button type="button" class="button primary tp-new">+ Nova tabela</button></div><div class="card tp-controls"><label>Buscar produto<input class="tp-search" type="search" value="${esc(state.query)}" placeholder="Nome ou código do produto"></label><label class="tp-history-field">Histórico<select class="tp-history"><option value="recent">Finalizados</option><option value="archived">Arquivo recuperável</option></select></label></div><p class="tp-help"></p><p class="tp-status" role="status" aria-live="polite"></p><p class="tp-total" role="status"></p><div class="tp-toolbar tp-batch"></div><div class="tp-grid" aria-live="polite"></div><nav class="tp-toolbar tp-pagination" aria-label="Páginas da tabela"><button type="button" class="button secondary tp-prev">Anterior</button><span></span><button type="button" class="button secondary tp-next">Próxima</button></nav><div class="tp-pdf-host"></div></section>`;
}
export function rowMarkup(entry, { tab, archived }, pending, selected) {
  return `<article class="card tp-row">${tab !== "finalized" ? `<label class="tp-checkbox tp-row-check"><input type="checkbox" data-check="${esc(entry.id)}" ${selected ? "checked" : ""}><span class="tp-sr">Selecionar ${esc(entry.name || "rascunho sem produto")}</span></label>` : ""}<div class="tp-row-main"><h2>${esc(entry.name || "Produto não selecionado")}</h2><strong class="tp-price">${esc(money(entry.cents))}</strong>${pending ? '<p class="tp-pending">Alterações não salvas. Abra para recuperar os campos antes de enviar.</p>' : ""}<p>${esc(entry.templateName || "Modelo pendente")} · ${esc(entry.quantity)} cópia(s)</p><p>${entry.start || entry.end ? `${date(entry.start)} a ${date(entry.end)}` : "Sem período de validade"}</p>${entry.status === "finalized" ? `<small>Finalizado em ${date(entry.finalizedAt)}</small>` : ""}</div><div class="tp-row-actions"><button class="button secondary" type="button" data-open="${esc(entry.id)}">${tab === "draft" ? "Editar" : "Ver detalhes"}</button>${archived ? `<button class="button secondary" type="button" data-restore="${esc(entry.id)}">Restaurar</button>` : ""}</div></article>`;
}
export function batchMarkup(tab, count) {
  if (!count) return "";
  if (tab === "finalized") return `<span>${count} item(ns) nesta página</span>`;
  return `<label class="tp-checkbox"><input class="tp-select-all" type="checkbox">Selecionar página (${count})</label><div class="tp-actions">${tab === "draft" ? '<button class="button primary tp-send" type="button">Enviar selecionados</button>' : '<button class="button primary tp-pdf" type="button">PDF</button><button class="button secondary tp-finalize" type="button">Finalizar impressos</button>'}<span class="tp-selected"></span></div>`;
}
