import { clearProductDrafts } from "./realtime.js";
export const drafts = new Map();
clearProductDrafts(() => drafts.clear());
