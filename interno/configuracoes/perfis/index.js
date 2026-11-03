import { bindFormDialog } from "../../../shared/form-dialog.js";
import { resourceError } from "../../cadastros/remote.js";
import { watchSetting } from "../realtime.js";
import { loadProfileSettings } from "../queries.js";
import { settings, addProfile, updateProfile } from "../state.js";
import { modules } from "../../modules.js";
import { frame, field, feedback, escapeHtml } from "../common.js";
export async function render(root) {
  const route = location.hash;
  try {
    await loadProfileSettings();
    if (!root.isConnected || route !== location.hash) return;
  } catch (error) {
    resourceError(root, error);
    return;
  }
  root.innerHTML = frame(
    "perfis",
    `<form class="profile-new">${field("Novo perfil", "name")}<button class="button primary" type="submit">Adicionar perfil</button></form><section class="profile-grid" aria-label="Perfis"></section>`,
  );
  const formModal = root.querySelector("form"),
    newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = "button primary";
  newButton.textContent = "Novo perfil";
  formModal.before(newButton);
  const modal = bindFormDialog(formModal, { host: root, title: "Novo perfil", resource: "profiles" });
  newButton.onclick = () => modal.open();
  const list = () => {
    root.querySelector(".profile-grid").innerHTML = settings.profiles
      .map(
        (p, i) =>
          `<article class="card profile-card"><div class="section-top"><h2>${escapeHtml(p.name)}</h2></div><p class="settings-helper">Módulos selecionados para este perfil</p><div class="settings-stack">${Object.entries(
            modules,
          )
            .map(
              ([key, module]) =>
                `<label class="settings-check"><input type="checkbox" data-profile="${i}" data-module="${key}" ${p.modules.includes(key) ? "checked" : ""}>${module.label}</label>`,
            )
            .join("")}</div></article>`,
      )
      .join("");
    root.querySelectorAll("[data-profile]").forEach(
      (input) =>
        (input.onchange = async () => {
          const p = settings.profiles[Number(input.dataset.profile)],
            key = input.dataset.module;
          const controls = [...input.closest(".profile-card").querySelectorAll("input")];
          try {
            controls.forEach((control) => (control.disabled = true));
            const selected = input.checked ? [...new Set([...p.modules, key])] : p.modules.filter((v) => v !== key);
            await updateProfile(p, { modules: selected });
            feedback(root, "Perfil atualizado.");
          } catch (error) {
            input.checked = p.modules.includes(key);
            feedback(root, error.message);
          } finally {
            controls.forEach((control) => (control.disabled = false));
          }
        }),
    );
  };
  root.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await addProfile(new FormData(form).get("name"));
      form.reset();
      modal.close();
      list();
      feedback(root, "Perfil adicionado.");
    } catch (error) {
      modal.error(error.message);
      feedback(root, error.message);
    } finally {
      button.disabled = false;
    }
  };
  list();
  watchSetting(root, "profiles", async () => {
    await loadProfileSettings();
    list();
  });
}
