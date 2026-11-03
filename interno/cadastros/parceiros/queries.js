import { replaceRows } from "../remote.js";
import { partnerService } from "./services.js";
import { resetPartnerContext } from "./realtime.js";

export const partners = [];
export async function loadPartners() {
  replaceRows(partners, await partnerService.list());
  return partners;
}
resetPartnerContext(() => partners.splice(0));
