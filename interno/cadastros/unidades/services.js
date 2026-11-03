import { listRecords, saveRecord } from "../../../shared/data/api.js";

export const unitService = {
  list: () => listRecords("units"),
  save: (input) => saveRecord("units", input, { expectedVersion: input._version }),
};
