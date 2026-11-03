import { replaceRows } from "../remote.js";
import { templates } from "./queries.js";
import { posterTemplateService } from "./services.js";
export async function saveTemplate(id, input) {
  const current = templates.find((row) => row.id === id);
  const saved = await posterTemplateService.save(id, input, current);
  const index = templates.findIndex((row) => row.id === id);
  if (index < 0) templates.push(saved);
  else templates[index] = saved;
  return saved;
}
export async function deleteTemplate(id, { expectedVersion } = {}) {
  const current = templates.find((row) => row.id === id);
  if (!current) throw Error("Modelo não encontrado.");
  await posterTemplateService.remove(id, expectedVersion ?? current._version);
  replaceRows(
    templates,
    templates.filter((row) => row.id !== id),
  );
  return current;
}
export async function createTemplate(input) {
  const saved = await posterTemplateService.create(input);
  const index = templates.findIndex((row) => row.id === saved.id);
  if (index < 0) templates.push(saved);
  else templates[index] = saved;
  return saved;
}
export async function createTemplateDraft() {
  return await posterTemplateService.draft();
}
