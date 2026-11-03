import { calculate, listRecords, saveRecord } from "../../shared/data/api.js";

export const readHomeSummary = () => calculate("home_summary", {});
export const readHomeNotices = () => listRecords("home_notices");
export const saveHomeNotice = (text, version) =>
  saveRecord("home_notices", { id: "main", text }, { expectedVersion: version });
