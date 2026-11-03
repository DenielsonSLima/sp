import { calculate, listRecords, saveRecord, deleteRecord } from "../../../shared/data/api.js";
import { normalizeTemplate } from "./definition.js";
export const posterTemplateService = {
  list: () => listRecords("poster_templates"),
  save: (id, input, current) =>
    saveRecord(
      "poster_templates",
      { ...current, ...input, id },
      { expectedVersion: input._version ?? current?._version },
    ),
  remove: (id, expectedVersion) => deleteRecord("poster_templates", id, { expectedVersion }),
  create: (input) => {
    const { id, _version, ...fields } = input;
    return saveRecord("poster_templates", fields);
  },
  draft: async () => normalizeTemplate(await calculate("poster_template_draft", {})),
};
