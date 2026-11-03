import { watchResource, watchResources } from "../cadastros/remote.js";

export function watchHome(root, { refreshSummary, refreshNotice }) {
  const stops = [
    watchResources(root, ["quotes", "hortifruti_receipts", "campaigns", "price_tables", "products"], refreshSummary),
  ];
  stops.push(watchResource(root, "home_notices", refreshNotice));
  return () => stops.forEach((stop) => stop());
}
