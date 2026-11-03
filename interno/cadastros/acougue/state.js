import { butcherCatalogService } from "./services.js";
import { models, receipts, loadButcherModels, loadButcherReceipts } from "./queries.js";
export { loadButcherModels, loadButcherReceipts } from "./queries.js";
const clone = (value) => structuredClone(value);
const key = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
export const listModels = () => clone(models);
export const listReceipts = () => clone(receipts);
export const categories = () => [...new Set(models.map((model) => model.category))];
export const currentModel = (category) =>
  clone(models.find((model) => key(model.category) === key(category) && model.current && model.active) || null);
export const percent = (bps) => (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const kg = (grams) =>
  (grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export async function saveModel(input) {
  const saved = await butcherCatalogService.saveModel(input);
  await loadButcherModels();
  return saved;
}
export async function setCurrent(id, expectedVersion) {
  const saved = await butcherCatalogService.setCurrent(id, expectedVersion ?? models.find((row) => row.id === id)?._version);
  await loadButcherModels();
  return saved;
}
export async function toggleModel(id, { confirmCurrent = false, expectedVersion } = {}) {
  const saved = await butcherCatalogService.toggle(id, confirmCurrent, expectedVersion ?? models.find((row) => row.id === id)?._version);
  await loadButcherModels();
  return saved;
}
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function validReceiptDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export const estimateReceipt = (input) => butcherCatalogService.estimate(input);
export async function saveReceipt(input) {
  const saved = await butcherCatalogService.createReceipt(input);
  const index = receipts.findIndex((row) => row.id === saved.id);
  if (index >= 0) receipts[index] = saved;
  else receipts.push(saved);
  return saved;
}
export const loadReceipt = (id) => butcherCatalogService.receipt(id);
export const loadReceiptPage = (filters) => butcherCatalogService.receiptPage(filters);
