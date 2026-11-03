import { listRecords, saveRecord, lookupPartnerCnpj } from "../../../shared/data/api.js";

export const partnerService = {
  list: () => listRecords("partners"),
  save: (input) => saveRecord("partners", input, { expectedVersion: input._version }),
};

export { lookupPartnerCnpj };
