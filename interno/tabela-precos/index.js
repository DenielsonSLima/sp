import { createDraftAutosave } from "./hooks/use-draft-autosave.js";
import { getDataContext } from "./services.js";
import { clearPriceTableDraftsOnContextChange } from "./realtime.js";
import { loadPriceTableEditor, loadPriceTableDetail } from "./queries.js";
import { renderPriceTableList } from "./views/list.js";
let stopRealtime;
import { heading, escapeHtml as esc } from "../../shared/ui.js";
import { attachCurrencyInput } from "../../shared/components/currency-input/index.js";
import { templates, dimensionLabel } from "../cadastros/modelos-cartaz/model.js";
import { priceTableStore as store } from "./state.js";
let products = [],
  rawDrafts = new Map(),
  newRaw = {},
  viewVersion = 0;
const listState = { tab: "draft", archived: false, query: "", page: 1 };
const chrome = () =>
  `${heading("OFERTAS E DIVULGAÇÃO", "Tabela de preços")}`;
export async function render(root) {
  const id = decodeURIComponent(location.hash.split("/")[1] || "");
  if (id) await editor(root, id);
  else list(root);
}
const status = (root, text) => {
  const node = root.querySelector(".tp-status");
  if (node) node.textContent = text;
};
function list(root, message = "") {
  viewVersion++;
  stopRealtime?.();
  history.replaceState(null, "", "#tabela-precos");
  stopRealtime = renderPriceTableList(root, { state: listState, chrome, rawDrafts, message,
    onOpen: (id) => editor(root, id), onCreate: () => editor(root) });
}
async function editor(root, id) {
  const token = ++viewVersion,
    openingRoute = location.hash,
    scope = getDataContext();
  stopRealtime?.();
  let entry, readonly;
  root.innerHTML = `${chrome()}<p role="status">Carregando editor…</p>`;
  {
    try {
      entry = id ? await loadPriceTableDetail(id) : null;
      if (id && !entry) throw Error("Tabela não encontrada. Atualize a lista.");
      readonly = entry && entry.status !== "draft";
      if (!readonly) products = await loadPriceTableEditor();
    } catch (error) {
      if (!root.isConnected || token !== viewVersion || openingRoute !== location.hash) return;
      root.innerHTML = `${chrome()}<p role="alert">${esc(error.message)}</p><button class="button secondary tp-back" type="button">← Voltar</button>`;
      root.querySelector(".tp-back").onclick = () => list(root);
      return;
    }
    if (
      !root.isConnected ||
      token !== viewVersion ||
      openingRoute !== location.hash ||
      scope?.companyId !== getDataContext()?.companyId ||
      scope?.user?.id !== getDataContext()?.user?.id
    )
      return;
  }
  const raw = readonly ? entry : (id ? rawDrafts.get(id) : newRaw) || entry || {};
  const value = {
    productId: "",
    priceRaw: "",
    start: "",
    end: "",
    templateId: "",
    quantity: "1",
    printLayout: "individual",
    ...entry,
    ...raw,
  };
  history.replaceState(null, "", `#tabela-precos${id ? `/${encodeURIComponent(id)}` : ""}`);
  const options =
    readonly && entry.productSnapshot
      ? [entry.productSnapshot]
      : products.some((p) => p.id === entry?.productId) || !entry?.productSnapshot
        ? products
        : [entry.productSnapshot, ...products];
  const models =
    readonly && entry.templateSnapshot
      ? [entry.templateSnapshot]
      : templates.some((t) => t.id === entry?.templateId) || !entry?.templateSnapshot
        ? templates
        : [entry.templateSnapshot, ...templates];
  root.innerHTML = `${chrome()}<section class="tp-module"><div class="tp-toolbar"><button class="button secondary tp-back" type="button">← Voltar</button><h2>${readonly ? "Detalhes do cartaz" : id ? "Editar rascunho" : "Nova tabela de preços"}</h2></div><form class="card tp-form"><fieldset ${readonly ? "disabled" : ""}><label class="tp-full">Produto do catálogo<select name="productId"><option value="">Selecione um produto</option>${options.map((p) => `<option value="${esc(p.id)}" ${p.id === value.productId ? "selected" : ""}>${esc(p.name)}${p.code ? ` · ${esc(p.code)}` : ""}</option>`).join("")}</select></label><label class="tp-full">Nome do produto<input name="productName" readonly value="${esc(value.productSnapshot?.name || options.find((p) => p.id === value.productId)?.name || "")}" placeholder="Preenchido ao selecionar o produto"></label><label>Preço de venda (R$)<input name="priceRaw" inputmode="decimal" value="${esc(value.priceRaw)}" placeholder="0,00"></label><label>Quantidade de cartazes<input name="quantity" type="text" inputmode="numeric" value="${esc(value.quantity)}"></label><label>Data inicial (opcional)<input name="start" type="date" value="${esc(value.start)}"></label><label>Data final (opcional)<input name="end" type="date" value="${esc(value.end)}"></label><p class="tp-full tp-help">Deixe as duas datas vazias para imprimir sem validade.</p><label class="tp-full">Modelo de impressão<select name="templateId"><option value="">Selecione um modelo</option>${models.map((t) => `<option value="${esc(t.id)}" ${t.id === value.templateId ? "selected" : ""}>${esc(t.name)} · ${esc(dimensionLabel(t))}</option>`).join("")}</select></label><label class="tp-full">Formato<select name="printLayout"><option value="individual" ${value.printLayout === "individual" ? "selected" : ""}>Folha individual do modelo</option><option value="two-a4" ${value.printLayout === "two-a4" ? "selected" : ""}>2 por A4 paisagem</option></select></label></fieldset>${!products.length && !readonly ? '<p>Cadastre produtos em <a href="#cadastros/produtos">Cadastros → Produtos</a>.</p>' : ""}${!templates.length && !readonly ? '<p>Cadastre um <a href="#cadastros/modelos-cartaz">modelo de cartaz</a> para enviar.</p>' : ""}<p class="tp-status" role="status" aria-live="polite"></p><div class="tp-actions">${readonly ? (entry.status === "sent" ? '<button type="button" class="button secondary tp-reopen">Voltar ao rascunho</button>' : "<p>Registro finalizado. Os dados e o modelo usados na impressão foram preservados.</p>") : '<button type="submit" class="button secondary" value="save">Salvar rascunho</button><button type="submit" class="button primary" value="send">Salvar e enviar</button>'}</div></form></section>`;
  const form = root.querySelector("form");
  const companyId = getDataContext()?.companyId,
    userId = getDataContext()?.user?.id;
  let pendingDraft = null,
    draining = null;
  const persistDraft = (data) => {
    pendingDraft = structuredClone(data);
    if (!draining) {
      draining = (async () => {
        let saved;
        while (pendingDraft) {
          if (companyId !== getDataContext()?.companyId || userId !== getDataContext()?.user?.id)
            throw Error("A empresa ativa mudou. Abra o rascunho novamente.");
          const current = pendingDraft;
          pendingDraft = null;
          saved = await store.saveDraft(id, current, products, templates);
          if (!id) {
            id = saved.id;
            if (form.isConnected && token === viewVersion) newRaw = {};
            if (form.isConnected && token === viewVersion)
              history.replaceState(null, "", `#tabela-precos/${encodeURIComponent(id)}`);
          }
        }
        return saved;
      })().finally(() => {
        draining = null;
      });
    }
    return draining;
  };
  const capture = () => {
    const data = Object.fromEntries(new FormData(form));
    if (id) rawDrafts.set(id, data);
    else newRaw = data;
    return data;
  };
  const draftSaver = createDraftAutosave(persistDraft, {
    onSaved: () => {
      if (form.isConnected && token === viewVersion) {
        rawDrafts.delete(id);
        status(root, "Rascunho salvo automaticamente.");
      }
    },
    onError: (error) => {
      if (form.isConnected && token === viewVersion) status(root, error.message);
    },
  });
  root.querySelector(".tp-back").onclick = async () => {
    if (!readonly) {
      const data = capture();
      try {
        draftSaver.schedule(data);
        const saved = await draftSaver.flush();
        if (id) rawDrafts.delete(id);
        else newRaw = {};
        id = saved.id;
      } catch (e) {
        status(root, e.message);
        return;
      }
    }
    list(root);
  };
  if (!readonly) {
    attachCurrencyInput(form.elements.priceRaw);
    const autosave = () => draftSaver.schedule(capture());
    form.oninput = autosave;
    form.onchange = autosave;
    form.elements.productId.onchange = () => {
      form.elements.productName.value = options.find((p) => p.id === form.elements.productId.value)?.name || "";
      capture();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        draftSaver.schedule(capture());
        const saved = await draftSaver.flush();
        if (id) rawDrafts.delete(id);
        else newRaw = {};
        id = saved.id;
        if (event.submitter?.value === "send") {
          await store.send([id]);
          listState.tab = "sent";
          list(root, "Item enviado para a fila interna.");
        } else {
          editor(root, id);
          status(root, "Rascunho salvo.");
        }
      } catch (e) {
        if (id) history.replaceState(null, "", `#tabela-precos/${encodeURIComponent(id)}`);
        status(root, e.message);
      }
    };
  } else form.onsubmit = (e) => e.preventDefault();
  root.querySelector(".tp-reopen")?.addEventListener("click", async () => {
    try {
      await store.reopen(id);
      listState.tab = "draft";
      editor(root, id);
    } catch (e) {
      status(root, e.message);
    }
  });
}

clearPriceTableDraftsOnContextChange(() => {
  viewVersion++;
  products = [];
  stopRealtime?.();
  rawDrafts.clear();
  newRaw = {};
});
