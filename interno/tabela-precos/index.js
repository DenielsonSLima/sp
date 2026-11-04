import { heading, escapeHtml as esc } from "../../shared/ui.js";
import { getDataContext } from "./services.js";
import { clearPriceTableDraftsOnContextChange } from "./realtime.js";
import { loadPriceTableDetail } from "./queries.js";
import { priceTableStore as store } from "./state.js";
import { renderPriceTableList } from "./views/list.js";
import { renderPromotionDetail } from "./views/promotion-detail.js";
import { openPromotionDialog } from "./views/promotion-dialog.js";
import { renderLegacyPriceTableEditor } from "./legacy-editor.js";

let stopView, viewVersion = 0;
const rawDrafts = new Map();
const listState = { tab: "draft", archived: false, query: "", page: 1 };
const chrome = () => heading("OFERTAS E DIVULGAÇÃO", "Tabela de preços");
export async function render(root) {
  const id = decodeURIComponent(location.hash.split("/")[1] || "");
  if (id) await detail(root, id);
  else list(root);
}
function list(root, message = "") {
  const token = ++viewVersion;
  stopView?.();
  history.replaceState(null, "", "#tabela-precos");
  stopView = renderPriceTableList(root, { state: listState, chrome, rawDrafts, message,
    onOpen: (id) => detail(root, id),
    onCreate: () => openPromotionDialog(root, {
      trigger: root.querySelector(".tp-new"),
      isCurrent: () => token === viewVersion && root.isConnected && location.hash === "#tabela-precos",
      onSave: (input) => store.createPromotion(input), onSaved: (saved) => detail(root, saved.id),
    }),
  });
}
async function detail(root, id) {
  const token = ++viewVersion, scope = getDataContext(), openingRoute = location.hash;
  stopView?.(); stopView = null;
  root.innerHTML = `${chrome()}<p role="status">Carregando promoção…</p>`;
  const current = () => token === viewVersion && root.isConnected && openingRoute === location.hash &&
    scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  try {
    const entry = await loadPriceTableDetail(id);
    if (!current()) return;
    if (!entry) throw Error("Promoção não encontrada. Atualize a lista.");
    if (entry.kind !== "promotion") {
      await renderLegacyPriceTableEditor(root, id, (message, tab) => {
        if (tab) listState.tab = tab;
        list(root, message);
      });
      return;
    }
    stopView = renderPromotionDetail(root, { entry, chrome, onBack: () => list(root), onDeleted: (message) => list(root, message) });
  } catch (error) {
    if (!current()) return;
    root.innerHTML = `${chrome()}<p role="alert">${esc(error.message)}</p><button class="button secondary tp-back" type="button">← Voltar</button>`;
    root.querySelector(".tp-back").onclick = () => list(root);
  }
}
clearPriceTableDraftsOnContextChange(() => {
  viewVersion++; stopView?.(); stopView = null; rawDrafts.clear();
});
