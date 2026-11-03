import { resourceError } from "../../cadastros/remote.js";
import { watchSetting } from "../realtime.js";
import { loadCompanySettings } from "../queries.js";
import { settings, saveCompany } from "../state.js";
import { frame, field, saveButton, feedback, escapeHtml } from "../common.js";
export async function render(root) {
  const route = location.hash;
  try {
    await loadCompanySettings();
    if (!root.isConnected || route !== location.hash) return;
  } catch (error) {
    resourceError(root, error);
    return;
  }
  const c = settings.company;
  root.innerHTML = frame(
    "empresa",
    `<div class="settings-columns"><form class="card settings-form"><h2>Identidade da empresa</h2><div class="settings-fields">${field("Nome de exibição", "name", c.name)}${field("Razão social", "legalName", c.legalName)}${field("CNPJ", "document", c.document)}${field("E-mail", "email", c.email, "email", "contato@example.com")}${field("Telefone", "phone", c.phone, "tel")}${field("Endereço", "address", c.address)}</div><div class="settings-actions">${saveButton}</div></form><section class="card settings-preview"><h2>Prévia da identidade</h2><div class="company-preview"></div><p class="preview-caption">Os dados preenchidos aparecem na prévia.</p></section></div>`,
  );
  const preview = () => {
    const c = settings.company;
    root.querySelector(".company-preview").innerHTML =
      `<span class="company-monogram">SP</span><h3>${escapeHtml(c.name)}</h3>${
        [c.legalName, c.document, c.email, c.phone, c.address]
          .filter(Boolean)
          .map((v) => `<p>${escapeHtml(v)}</p>`)
          .join("") || "<p>Dados adicionais ainda não preenchidos.</p>"
      }`;
  };
  root.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await saveCompany({ ...Object.fromEntries(new FormData(e.currentTarget)), _version: c._version });
      preview();
      feedback(root, "Identidade atualizada.");
    } catch (error) {
      feedback(root, error.message);
    } finally {
      button.disabled = false;
    }
  };
  preview();
  watchSetting(root, "company_settings", () => {
    feedback(
      root,
      "Há uma atualização no banco. Reabra esta configuração para carregar os dados mais recentes; seus campos foram preservados.",
    );
  });
}
