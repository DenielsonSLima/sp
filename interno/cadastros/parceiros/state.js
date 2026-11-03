import { partnerService } from "./services.js";
import { partners } from "./queries.js";
export { partners, loadPartners } from "./queries.js";
export const partnerTypes = ["Fornecedor", "Cliente", "Ambos", "Outro"];

export async function addPartner(input) {
  const saved = await partnerService.save(input);
  const index = partners.findIndex((row) => row.id === saved.id);
  if (index < 0) partners.push(saved);
  else partners[index] = saved;
  return saved;
}
