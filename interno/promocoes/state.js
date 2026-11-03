import { records as remote, runCampaign } from "./services.js";
import { loadCampaigns } from "./queries.js";
export { loadCampaigns } from "./queries.js";
import { validDate, templates } from "../cadastros/modelos-cartaz/model.js";
const listeners = new Set();
export const localToday = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const campaignStatus = (campaign, today = localToday()) => (campaign.end < today ? "finished" : "active");
const normalize = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function campaignPage(
  campaigns,
  { query = "", start = "", end = "", tab = "active", page = 1, today = localToday() } = {},
) {
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end))
    throw Error("Informe um período de busca válido.");
  const q = normalize(query).trim();
  const found = campaigns.filter(
    (c) =>
      campaignStatus(c, today) === tab &&
      (!q || normalize(`${c.name} ${c.notes}`).includes(q)) &&
      (!start || c.end >= start) &&
      (!end || c.start <= end),
  );
  const pages = Math.max(1, Math.ceil(found.length / 12)),
    current = Math.max(1, Math.min(pages, Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1));
  return { items: found.slice((current - 1) * 12, current * 12), total: found.length, page: current, pages };
}
const run = async (action, id, payload) => {
  const saved = await runCampaign(action, id, payload);
  for (const listener of listeners) listener();
  return saved;
};
const remoteCampaigns = {
  get: (id) => remote.get(id),
  list: () => remote.list(),
  warning: "",
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  create: (input) => run("create", null, input),
  update: (id, input) => run("update", id, input),
  addItem: (id, input) => run("addItem", id, { ...input, templateId: input.templateId || templates[0]?.id }),
  updateItem: (id, itemId, input) => run("updateItem", id, { itemId, input }),
  removeItem: (id, itemId) => run("removeItem", id, { itemId }),
};
export const campaignStore = remoteCampaigns;
export const readCampaigns = () => campaignStore.list();
export const subscribeCampaigns = (listener) => campaignStore.subscribe(listener);
