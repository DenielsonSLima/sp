import { calendarItems } from "../model.js";
import { commercialDates, suggestedPeriods, retailHolidays } from "../commercial.js";

/** Annual reference dates are stable while searching or selecting days. */
export function createCalendarItemsReader(readEntries, readCampaigns) {
  let currentYear = null,
    references = [];
  return (month) => {
    const year = Number(month.slice(0, 4));
    if (year !== currentYear) {
      currentYear = year;
      const years = [year - 1, year, year + 1];
      references = [
        ...years.flatMap(retailHolidays),
        ...years.flatMap(commercialDates),
        ...years.flatMap(suggestedPeriods),
      ];
    }
    return [...calendarItems(readEntries(), readCampaigns()), ...references];
  };
}
