import { watchPartners } from "./realtime.js";
import { resourceError } from "../remote.js";
import { heading, escapeHtml as esc } from "../../../shared/ui.js";
import { icon } from "../../../shared/icons.js";
import { filterRecords } from "../../../shared/filters.js";
import { partners, partnerTypes, loadPartners } from "./state.js";
import { openPartnerDialog } from "./dialog.js";
const documentLabel = (value) => String(value || "").replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
export async function render(root) {
  try {
    await loadPartners();
  } catch (error) {
    resourceError(root, error);
    return;
  }
  if (!root.isConnected) return;
  root.innerHTML = `<link rel="stylesheet" href="./interno/cadastros/catalog.css"><link rel="stylesheet" href="./interno/cadastros/parceiros/styles.css"><div class="page-heading-actions">${heading("CADASTROS", "Parceiros")}<button class="button primary new-partner">${icon("plus")} Novo parceiro</button></div><section class="card catalog-filters" aria-label="Filtros de parceiros"><label>Buscar parceiro<input type="search" class="search" placeholder="Nome, CNPJ, cidade ou contato..."></label><label>Categoria<select class="category-filter"><option value="">Todas as categorias</option>${partnerTypes.map((type) => `<option>${esc(type)}</option>`).join("")}</select></label><button class="button secondary catalog-clear" type="button">Limpar filtros</button></section><p class="catalog-count" aria-live="polite"></p><section class="catalog-grid" aria-label="Parceiros encontrados"></section><p class="catalog-status" role="status"></p>`;
  const open = (partner, trigger) =>
    openPartnerDialog({
      host: root,
      partner,
      trigger,
      onSaved: () => {
        if (root.isConnected) {
          list();
          root.querySelector(".catalog-status").textContent = "Parceiro salvo no banco.";
        }
      },
    });
  let renderedSignature = "";
  const list = () => {
    const signature = JSON.stringify([
      partners,
      root.querySelector("[type=search]")?.value,
      root.querySelector(".category-filter")?.value,
    ]);
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    const rows = filterRecords(
      partners.map((row) => ({ ...row, document: documentLabel(row.cnpj) })),
      {
        query: root.querySelector(".search").value,
        category: root.querySelector(".category-filter").value,
        categoryKey: "type",
        searchKeys: ["name", "tradeName", "legalName", "cnpj", "document", "city", "email", "phone"],
      },
    );
    root.querySelector(".catalog-count").textContent = `${rows.length} de ${partners.length} parceiro(s)`;
    root.querySelector(".catalog-grid").innerHTML = rows.length
      ? rows
          .map(
            (p) =>
              `<article class="card catalog-card partner-card"><div class="catalog-card-body"><div class="partner-card-top"><span class="partner-avatar">${esc(p.name.slice(0, 2).toLocaleUpperCase("pt-BR"))}</span><button type="button" class="button secondary" data-edit="${esc(p.id)}" aria-label="Editar ${esc(p.name)}">Editar</button></div><span class="catalog-category">${esc(p.type)}</span><h3>${esc(p.name)}</h3>${p.legalName ? `<p class="partner-legal-name">${esc(p.legalName)}</p>` : ""}<div class="partner-contact">${p.cnpj ? `<p><span>CNPJ</span>${esc(documentLabel(p.cnpj))}</p>` : ""}<p><span>E-mail</span>${esc(p.email) || "Não informado"}</p><p><span>Telefone</span>${esc(p.phone) || "Não informado"}</p><p><span>Cidade/UF</span>${esc([p.city, p.state].filter(Boolean).join(" / ")) || "Não informado"}</p><p><span>Endereço</span>${esc([p.street, p.number, p.complement].filter(Boolean).join(", ")) || "Não informado"}</p><p><span>Bairro</span>${esc(p.district) || "Não informado"}</p><p><span>CEP</span>${esc(String(p.postalCode || "").replace(/^(\d{5})(\d{3})$/, "$1-$2")) || "Não informado"}</p></div></div></article>`,
          )
          .join("")
      : '<div class="card catalog-empty"><h3>Nenhum parceiro encontrado.</h3><p>Cadastre um parceiro ou ajuste os filtros.</p></div>';
    root.querySelectorAll("[data-edit]").forEach(
      (button) =>
        (button.onclick = () =>
          open(
            partners.find((row) => row.id === button.dataset.edit),
            button,
          )),
    );
  };
  root.querySelector(".new-partner").onclick = (event) => open(null, event.currentTarget);
  root.querySelector(".search").oninput = list;
  root.querySelector(".category-filter").onchange = list;
  root.querySelector(".catalog-clear").onclick = () => {
    root.querySelector(".search").value = "";
    root.querySelector(".category-filter").value = "";
    list();
    root.querySelector(".search").focus();
  };
  list();
  watchPartners(root, list);
}
