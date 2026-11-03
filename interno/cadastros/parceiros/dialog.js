import { escapeHtml as esc } from "../../../shared/ui.js";
import { lookupPartnerCnpj } from "./services.js";
import { clearOnContextChange } from "../remote.js";
import { addPartner, partnerTypes } from "./state.js";
const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
const fields = [
  "cnpj",
  "name",
  "legalName",
  "tradeName",
  "type",
  "email",
  "phone",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "postalCode",
];
const compact = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[./\s-]/g, "");
export function openPartnerDialog({
  host,
  partner = null,
  trigger,
  onSaved = () => {},
  save = addPartner,
  lookup = lookupPartnerCnpj,
}) {
  const existing = host.querySelector(".partner-dialog");
  if (existing) return existing;
  const dialog = document.createElement("dialog"),
    events = new AbortController();
  const previousOverflow = document.body.style.overflow;
  let settled = false,
    saving = false,
    consulting = false,
    lookupVersion = 0,
    stopContext = () => {};
  const input = (name, label, limit, extra = "") =>
    `<label>${label}<input name="${name}" maxlength="${limit}" value="${esc(partner?.[name] || "")}" ${extra}></label>`;
  dialog.className = "partner-dialog";
  dialog.setAttribute("aria-labelledby", "partner-dialog-title");
  dialog.innerHTML = `<form><header class="partner-dialog-heading"><h2 id="partner-dialog-title">${partner ? "Editar parceiro" : "Novo parceiro"}</h2><button type="button" class="partner-dialog-close" data-close aria-label="Fechar cadastro de parceiro">×</button></header><div class="partner-dialog-body"><section><h3>Identificação</h3><div class="partner-cnpj-row"><label>CNPJ<input name="cnpj" maxlength="18" value="${esc(partner?.cnpj || "")}" placeholder="00.000.000/0000-00" autocomplete="off" autocapitalize="characters" spellcheck="false"></label><button type="button" class="button secondary" data-lookup>Consultar CNPJ</button></div><p class="partner-lookup-status" role="status" aria-live="polite"></p><div class="partner-fields">${input("name", "Nome do parceiro", 100, 'required autocomplete="organization"')}<label>Categoria / tipo<select name="type">${partnerTypes.map((type) => `<option ${type === (partner?.type || "Fornecedor") ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>${input("legalName", "Razão social", 200)}${input("tradeName", "Nome fantasia", 100)}</div></section><section><h3>Contato</h3><div class="partner-fields">${input("email", "E-mail", 254, 'type="email" autocomplete="email"')}${input("phone", "Telefone", 40, 'type="tel" autocomplete="tel"')}</div></section><section><h3>Endereço</h3><div class="partner-address-fields">${input("postalCode", "CEP", 9, 'placeholder="00000-000" autocomplete="postal-code"')}<label>UF<select name="state"><option value="">Selecione</option>${states.map((state) => `<option value="${state}" ${state === partner?.state ? "selected" : ""}>${state}</option>`).join("")}</select></label>${input("city", "Cidade", 100, 'autocomplete="address-level2"')}${input("district", "Bairro", 100)}${input("street", "Logradouro", 160, 'autocomplete="address-line1"')}${input("number", "Número", 30)}${input("complement", "Complemento", 160, 'autocomplete="address-line2"')}</div></section><p class="partner-save-error" role="alert"></p></div><footer class="partner-dialog-actions"><button type="button" class="button secondary" data-cancel>Cancelar</button><button class="button primary" type="submit">Salvar parceiro</button></footer></form>`;
  const form = dialog.querySelector("form"),
    lookupButton = dialog.querySelector("[data-lookup]"),
    submit = form.querySelector("[type=submit]"),
    lookupStatus = dialog.querySelector(".partner-lookup-status"),
    error = dialog.querySelector(".partner-save-error");
  const finish = () => {
    if (settled) return;
    settled = true;
    lookupVersion++;
    events.abort();
    stopContext();
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  };
  const cancel = () => {
    if (!saving) finish();
  };
  dialog.querySelector("[data-close]").onclick = cancel;
  dialog.querySelector("[data-cancel]").onclick = cancel;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancel();
  });
  dialog.addEventListener("close", finish);
  form.elements.cnpj.oninput = () => {
    lookupVersion++;
    lookupStatus.textContent = "";
  };
  lookupButton.onclick = async () => {
    if (consulting || saving) return;
    consulting = true;
    lookupButton.disabled = true;
    submit.disabled = true;
    const current = ++lookupVersion,
      documentValue = compact(form.elements.cnpj.value),
      before = Object.fromEntries(fields.map((key) => [key, form.elements[key].value]));
    lookupStatus.textContent = "Consultando CNPJ…";
    try {
      const result = await lookup(form.elements.cnpj.value);
      if (settled || current !== lookupVersion || compact(form.elements.cnpj.value) !== documentValue) return;
      for (const key of fields)
        if (key !== "type" && Object.hasOwn(result.record, key) && form.elements[key].value === before[key])
          form.elements[key].value = result.record[key] || "";
      form.elements.state.dispatchEvent(new Event("change", { bubbles: true }));
      lookupStatus.textContent = `Dados consultados em ${result.provider}. Revise as informações antes de salvar.`;
    } catch (e) {
      if (!settled && current === lookupVersion) lookupStatus.textContent = e.message;
    } finally {
      consulting = false;
      if (!settled) {
        lookupButton.disabled = false;
        submit.disabled = saving;
      }
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || consulting || settled) return;
    saving = true;
    error.textContent = "";
    const record = Object.fromEntries(fields.map((key) => [key, form.elements[key].value]));
    if (partner) {
      record.id = partner.id;
      record._version = partner._version;
    }
    const controls = form.querySelectorAll("button,input,select");
    controls.forEach((node) => (node.disabled = true));
    submit.textContent = "Salvando…";
    try {
      const saved = await save(record);
      if (settled || !host.isConnected) return;
      finish();
      onSaved(saved);
    } catch (e) {
      if (!settled) error.textContent = e.message;
    } finally {
      saving = false;
      if (!settled) {
        controls.forEach((node) => (node.disabled = false));
        submit.textContent = "Salvar parceiro";
      }
    }
  };
  window.addEventListener("hashchange", finish, { signal: events.signal });
  stopContext = clearOnContextChange("partners", finish);
  host.append(dialog);
  document.body.style.overflow = "hidden";
  dialog.showModal();
  form.elements.cnpj.focus();
  return dialog;
}
