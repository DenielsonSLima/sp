import { listRecords, saveRecord, getDataContext } from "../../shared/data/api.js";

export const readSettingRecords = (resource) => listRecords(resource);
export const writeSettingRecord = (resource, record, options) => saveRecord(resource, record, options);
export const settingsScope = () => {
  const context = getDataContext();
  return `${context?.companyId || ""}:${context?.user?.id || ""}`;
};
