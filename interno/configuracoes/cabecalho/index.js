import { resourceError } from "../../cadastros/remote.js";
import { watchSetting } from "../realtime.js";
import { loadHeaderSettings } from "../queries.js";
import { settings, saveHeader } from "../state.js";
import { frame, field, feedback, escapeHtml, emptyLines } from "../common.js";
export async function render(root) {
  const route = location.hash;
  try {
    await loadHeaderSettings();
    if (!root.isConnected || route !== location.hash) return;
  } catch (error) {
    resourceError(root, error);
    return;
  }
  const h = settings.header;
  root.innerHTML = frame(
    "cabecalho",
    `<div class="settings-columns"><form class="card settings-form"><h2>Apresentação do cabeçalho</h2><div class="settings-stack">${field("Título", "title", h.title)}${field("Subtítulo", "subtitle", h.subtitle)}<label>Alinhamento<select name="alignment"><option value="left">À esquerda</option><option value="center">Centralizado</option></select></label><label class="settings-check"><input name="showLogo" type="checkbox" ${h.showLogo ? "checked" : ""}>Exibir a logomarca da loja</label><label class="settings-check"><input name="showContact" type="checkbox" ${h.showContact ? "checked" : ""}>Exibir contatos preenchidos em Empresa</label></div><p class="settings-helper">Os campos atualizam a prévia ao lado. Use o submódulo Empresa para editar os contatos.</p><a class="settings-back" href="#configuracoes/empresa">Editar dados da empresa →</a><div class="settings-actions"><button type="submit" class="button primary">Salvar cabeçalho</button></div></form><section class="card settings-preview"><h2>Prévia do documento</h2><div class="preview-paper"><div class="document-header"></div>${emptyLines()}${emptyLines()}</div></section></div>`,
  );
  const form = root.querySelector("form");
  form.elements.alignment.value = h.alignment;
  const read = () => ({
    _version: h._version,
    title: form.elements.title.value,
    subtitle: form.elements.subtitle.value,
    showLogo: form.elements.showLogo.checked,
    showContact: form.elements.showContact.checked,
    alignment: form.elements.alignment.value,
  });
  const preview = () => {
    const h = read();
    const contact = [settings.company.email, settings.company.phone, settings.company.address].filter(Boolean);
    root.querySelector(".document-header").innerHTML =
      `<div class="header-preview ${h.alignment === "center" ? "centered" : ""}">${h.showLogo ? '<div class="header-brand"><img src="./assets/logo-original.jpg" alt="Supermercado do Povo"></div>' : ""}<strong>${escapeHtml(h.title)}</strong><span>${escapeHtml(h.subtitle)}</span>${h.showContact && contact.length ? `<p>${contact.map(escapeHtml).join(" · ")}</p>` : ""}</div>`;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await saveHeader(read());
      feedback(root, "Cabeçalho salvo.");
    } catch (error) {
      feedback(root, error.message);
    } finally {
      button.disabled = false;
    }
  };
  form.oninput = preview;
  preview();
  watchSetting(root, "headers", () => {
    feedback(
      root,
      "Há uma atualização no banco. Reabra esta configuração para carregar os dados mais recentes; seus campos foram preservados.",
    );
  });
}
