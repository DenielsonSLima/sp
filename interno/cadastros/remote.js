import { listRecords, saveRecord, deleteRecord, subscribeResource, getDataContext } from "../../shared/data/api.js";
export { listRecords, saveRecord, deleteRecord, subscribeResource, getDataContext };
export const replaceRows = (target, rows) => {
  target.splice(0, target.length, ...rows);
  return target;
};
export function resourceError(root, error) {
  root.innerHTML = "";
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.className = "card";
  message.textContent = error.message || "Não foi possível carregar os dados.";
  root.append(message);
}
export { watchResource, watchResources } from "../../shared/data/resource-watch.js";

export function clearOnContextChange(resource, clear) {
  return subscribeResource(resource, () => {
    if (!getDataContext()) clear();
  });
}
export async function hydrateCatalogs() {
  const [{ loadUnits }, { loadPartners }] = await Promise.all([
    import("./unidades/state.js"),
    import("./parceiros/state.js"),
  ]);
  await Promise.all([loadUnits(), loadPartners()]);
}
