import { replaceRows } from "../remote.js";
import { posterTemplateService } from "./services.js";
import { resetPosterTemplateContext } from "./realtime.js";
export const templates = [];
export let storageWarning = "";
export async function loadTemplates() {
  replaceRows(templates, await posterTemplateService.list());
  storageWarning = "";
  return { loaded: true, warning: "" };
}
resetPosterTemplateContext(() => templates.splice(0));
