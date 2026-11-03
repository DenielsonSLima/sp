import { replaceRows } from "../remote.js";
import { unitService } from "./services.js";
import { resetUnitContext } from "./realtime.js";

export const units = [];
export const unitLabel = (id) => {
  const unit = units.find((row) => row.id === id);
  return unit ? `${unit.symbol} · ${unit.name}` : id;
};
export async function loadUnits() {
  replaceRows(units, await unitService.list());
  return units;
}
resetUnitContext(() => units.splice(0));
