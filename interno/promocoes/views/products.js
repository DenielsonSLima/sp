import { escapeHtml as esc } from "../../../shared/ui.js";
import {
  attachCurrencyInput,
  currencyDecimal,
  formatBRLCents,
} from "../../../shared/components/currency-input/index.js";
import { templates } from "../../cadastros/modelos-cartaz/model.js";
import { units } from "../../cadastros/unidades/state.js";
import { campaignStore } from "../state.js";
import { getDataContext } from "../services.js";
import { createNameAutosave } from "../hooks/use-name-autosave.js";
const money = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function renderProducts(body, campaignId, status, { products, raw, release }) {
  let campaign = campaignStore.get(campaignId);
  const scope = getDataContext(),
    current = () => scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  const names = createNameAutosave(
    (id, displayName) => campaignStore.updateItem(campaignId, id, { displayName }),
    {
      isCurrent: current,
      onSaved: (id, value) => {
        if (raw.names[id] === value) delete raw.names[id];
        if (body.isConnected) status("Nome no cartaz salvo.");
      },
      onError: (error) => { if (body.isConnected) status(error.message); },
    },
  );
  body.innerHTML = `<form class="card campaign-product-form"><h2>Adicionar produto</h2><div class="campaign-product-fields"><label>Produto<select name="productId" required><option value="">Selecione um produto</option>${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><label>Preço da oferta (R$)<input name="price" inputmode="decimal" placeholder="0,00" required></label><label>Unidade<select name="unit"><option value="unid">unid</option><option value="kg">kg</option></select></label><button class="button primary" type="submit" ${products.length && templates.length ? "" : "disabled"}>Adicionar produto</button></div>${!products.length ? '<p>Cadastre produtos em <a href="#cadastros/produtos">Cadastros → Produtos</a>.</p>' : ""}${!templates.length ? '<p>Crie um modelo em <a href="#cadastros/modelos-cartaz">Cadastros → Modelos de cartaz</a> para adicionar produtos. Os cartazes já salvos continuam disponíveis.</p>' : ""}</form><section class="campaign-product-list"></section>`;
  const form = body.querySelector("form");
  for (const [key, value] of Object.entries(raw.product)) if (form.elements[key]) form.elements[key].value = value;
  attachCurrencyInput(form.elements.price);
  form.oninput = form.onchange = () => {
    raw.product = Object.fromEntries(new FormData(form));
  };
  form.elements.productId.onchange = () => {
    const product = products.find((p) => p.id === form.elements.productId.value);
    form.elements.unit.value = units.find((u) => u.id === product?.unit)?.symbol.toUpperCase() === "KG" ? "kg" : "unid";
    form.elements.unit.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const list = () => {
    campaign = campaignStore.get(campaignId);
    body.querySelector(".campaign-product-list").innerHTML = campaign.items.length
      ? campaign.items
          .map(
            (i) =>
              `<article class="card campaign-product-row"><div><strong>${esc(i.name)}</strong><p>${money(i.cents)} / ${i.unit}</p></div><label>Preço (R$)<input class="edit-product-price" data-id="${i.id}" inputmode="decimal" value="${esc(raw.prices[i.id] ?? formatBRLCents(i.cents))}"></label><label class="campaign-display-name">Nome no cartaz<textarea class="edit-product-name" data-id="${i.id}" rows="3" maxlength="300" placeholder="${esc(i.name)}">${esc(raw.names[i.id] ?? i.displayName ?? "")}</textarea><small>Enter cria uma nova linha. Deixe vazio para usar o nome original.</small></label><button class="button secondary remove-campaign-item" data-id="${i.id}" type="button" aria-label="Remover ${esc(i.name)}">Remover</button></article>`,
          )
          .join("")
      : '<div class="card campaign-empty"><h2>Adicione os produtos desta campanha.</h2><p>Depois, escolha os modelos e as quantidades na aba Impressão de cards.</p></div>';
    body.querySelectorAll(".remove-campaign-item").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            b.disabled = true;
            await names.flush(b.dataset.id);
            await campaignStore.removeItem(campaignId, b.dataset.id);
            names.forget(b.dataset.id);
            delete raw.prices[b.dataset.id];
            delete raw.names[b.dataset.id];
            delete raw.print[b.dataset.id];
            b.closest(".campaign-product-row").remove();
            if (!campaignStore.get(campaignId).items.length) list();
            status("Produto removido e campanha salva.");
          } catch (e) {
            status(e.message);
            b.disabled = false;
          }
        }),
    );
    body.querySelectorAll(".edit-product-name").forEach((input) => {
      names.register(input.dataset.id, campaign.items.find((item) => item.id === input.dataset.id)?.displayName || "");
      input.oninput = () => {
        raw.names[input.dataset.id] = input.value;
        release();
        names.schedule(input.dataset.id, input.value);
        status("Alterações pendentes…");
      };
      input.onchange = () => {
        input.oninput();
        void names.flush(input.dataset.id).catch(() => {});
      };
    });
    body.querySelectorAll(".edit-product-price").forEach((input) => {
      attachCurrencyInput(input);
      input.oninput = () => {
        raw.prices[input.dataset.id] = input.value;
      };
      input.onchange = async () => {
        raw.prices[input.dataset.id] = input.value;
        try {
          if (!input.checkValidity()) throw Error(input.validationMessage);
          const saved = await campaignStore.updateItem(campaignId, input.dataset.id, {
              price: currencyDecimal(input.value),
            }),
            item = saved.items.find((i) => i.id === input.dataset.id);
          delete raw.prices[input.dataset.id];
          input.value = formatBRLCents(item.cents);
          input.closest(".campaign-product-row").querySelector("p").textContent = `${money(item.cents)} / ${item.unit}`;
          status("Preço salvo.");
        } catch (e) {
          status(e.message);
        }
      };
    });
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form));
      await campaignStore.addItem(campaignId, { ...values, price: currencyDecimal(values.price) }, products);
      form.elements.price.value = "";
      raw.product = Object.fromEntries(new FormData(form));
      list();
      status("Produto adicionado. Campanha salva.");
    } catch (error) {
      status(error.message);
    }
  };
  list();
  return names;
}
