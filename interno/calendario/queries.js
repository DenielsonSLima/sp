import { records } from "./services.js";
import { listCampaignCalendar } from "../../shared/data/api.js";
import { monthGrid } from "./model.js";

export const loadCalendar = () => records.load();
export const campaignPeriod = (month) => {
  const days = monthGrid(month).filter(Boolean);
  return { start: days[0], end: days.at(-1) };
};
export const loadCalendarCampaigns = (month) => listCampaignCalendar(campaignPeriod(month));
export async function loadCalendarPage(month) {
  const [, campaigns] = await Promise.all([loadCalendar(), loadCalendarCampaigns(month)]);
  return campaigns;
}
export const readCalendarEntries = () => records.list();
export const getCalendarEntry = (id) => records.get(id);
