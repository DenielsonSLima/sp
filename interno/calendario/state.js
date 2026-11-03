export * from "./model.js";
export { loadCalendar } from "./queries.js";
import { loadCalendar, readCalendarEntries, getCalendarEntry } from "./queries.js";
import { createCalendarEntry, updateCalendarEntry, removeCalendarEntry } from "./services.js";

export const calendarStore = {
  list: readCalendarEntries,
  get: getCalendarEntry,
  reload: loadCalendar,
  warning: "",
  create: createCalendarEntry,
  update: updateCalendarEntry,
  remove: removeCalendarEntry,
};
