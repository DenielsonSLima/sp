import { saveRecord, deleteRecord } from "../../shared/data/api.js";
import { createOperationalStore } from "../operational-store.js";

export const records = createOperationalStore("calendar_events", undefined, { realtime: false });
export async function createCalendarEntry(input) {
  const saved = await saveRecord("calendar_events", { ...input, id: crypto.randomUUID() });
  records.accept(saved);
  return saved;
}
export async function updateCalendarEntry(id, input) {
  const current = records.get(id);
  const saved = await saveRecord(
    "calendar_events",
    { ...current, ...input, id },
    { expectedVersion: current._version },
  );
  records.accept(saved);
  return saved;
}
export async function removeCalendarEntry(id) {
  const current = records.get(id);
  await deleteRecord("calendar_events", id, { expectedVersion: current._version });
  records.remove(id);
}
