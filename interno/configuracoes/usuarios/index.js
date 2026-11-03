import { loadProfileSettings } from "../queries.js";
import { bindFormDialog } from "../../../shared/form-dialog.js";
import { resourceError } from "../../cadastros/remote.js";
import { watchSetting } from "../realtime.js";
import { loadUserSettings } from "../queries.js";
import { settings, addUser, updateUser } from "../state.js";
import { frame, field, saveButton, feedback, escapeHtml } from "../common.js";
export async function render(root) {
  const route = location.hash;
  try {
    await loadUserSettings();
    if (!root.isConnected || route !== location.hash) return;
  } catch (error) {
    resourceError(root, error);
    return;
  }
  root.innerHTML = frame(
    "usuarios",
    `<form class="card settings-form user-form"><h2>Adicionar usuário</h2><div class="settings-fields">${field("Nome", "name")}${field("E-mail", "email", "", "email", "usuario@example.com")}<label>Perfil<select name="profile">${settings.profiles.map((p) => `<option>${escapeHtml(p.name)}</option>`).join("")}</select></label></div><div class="settings-actions">${saveButton}</div></form><section class="card settings-form"><h2>Equipe</h2><p class="mobile-table-hint">Deslize a lista para ver todas as colunas.</p><div class="settings-table-wrap" tabindex="0" role="region" aria-label="Lista de usuários"><table class="settings-table"><thead><tr><th>NOME</th><th>E-MAIL</th><th>PERFIL</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody></tbody></table></div></section>`,
  );
  const form = root.querySelector("form");
  const formModal = root.querySelector("form"),
    newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = "button primary";
  newButton.textContent = "Adicionar usuário";
  formModal.before(newButton);
  const modal = bindFormDialog(formModal, { host: root, title: "Adicionar usuário", resource: "user_access" });
  newButton.onclick = () => modal.open();
  form.elements.name.required = true;
  form.elements.email.required = true;
  const list = () => {
    root.querySelector("tbody").innerHTML = settings.users
      .map(
        (u) =>
          `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.profile)}</td><td><span class="tag ${u.active ? "tag-green" : ""}">${u.active ? "Ativo" : "Inativo"}</span></td><td><button class="button secondary" data-user="${u.id}" type="button">${u.active ? "Desativar" : "Ativar"}</button></td></tr>`,
      )
      .join("");
    root.querySelectorAll("[data-user]").forEach(
      (button) =>
        (button.onclick = async () => {
          const user = settings.users.find((u) => u.id === button.dataset.user);
          try {
            button.disabled = true;
            await updateUser(user, { active: !user.active });
            list();
            root.querySelector(`[data-user="${user.id}"]`).focus();
            feedback(root, "Status atualizado.");
          } catch (error) {
            button.disabled = false;
            feedback(root, error.message);
          }
        }),
    );
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await addUser(Object.fromEntries(new FormData(form)));
      form.reset();
      modal.close();
      list();
      feedback(root, "Usuário adicionado.");
    } catch (error) {
      modal.error(error.message);
      feedback(root, error.message);
    } finally {
      button.disabled = false;
    }
  };
  list();
  watchSetting(root, "user_access", async () => {
    await loadUserSettings();
    list();
  });
  watchSetting(root, "profiles", async () => {
    const selected = form.elements.profile.value;
    await loadProfileSettings();
    if (!form.isConnected) return;
    form.elements.profile.innerHTML = settings.profiles
      .map((profile) => `<option>${escapeHtml(profile.name)}</option>`)
      .join("");
    form.elements.profile.value = selected;
  });
}
