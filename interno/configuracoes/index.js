import { heading } from "../../shared/ui.js";
import { submodules, icon } from "./common.js";
const loaders = {
  empresa: () => import("./empresa/index.js"),
  usuarios: () => import("./usuarios/index.js"),
  perfis: () => import("./perfis/index.js"),
  "marca-dagua": () => import("./marca-dagua/index.js"),
  cabecalho: () => import("./cabecalho/index.js"),
};
export async function render(root) {
  const sub = location.hash.split("/")[1];
  if (Object.hasOwn(loaders, sub)) {
    const module = await loaders[sub]();
    if (root.isConnected) await module.render(root);
    return;
  }
  root.innerHTML = `<link rel="stylesheet" href="./interno/configuracoes/styles.css">${heading("ADMINISTRAÇÃO", "Configurações")}<section class="settings-grid" aria-label="Submódulos de configurações">${Object.entries(
    submodules,
  )
    .map(
      ([key, item], index) =>
        `<a class="card settings-card" href="#configuracoes/${key}"><div class="settings-card-top"><span class="settings-card-icon tone-${index}">${icon(item.icon)}</span><span class="settings-card-arrow">${icon("arrow")}</span></div><h2>${item.title}</h2><p>${item.description}</p><span class="settings-card-bottom">Personalizar <span>0${index + 1}</span></span></a>`,
    )
    .join("")}</section>`;
}
