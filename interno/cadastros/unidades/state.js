import { unitService } from "./services.js";
import { units } from "./queries.js";
export { units, loadUnits, unitLabel } from "./queries.js";

export async function saveUnit(input) {
  const saved = await unitService.save(input);
  const index = units.findIndex((row) => row.id === saved.id);
  if (index < 0) units.push(saved);
  else units[index] = saved;
  return saved;
}
