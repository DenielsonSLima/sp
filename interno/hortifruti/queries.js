import { normalizeSearch } from '../../shared/filters.js';
import { readHortifruti, listHortifrutiSnapshots, getHortifrutiSnapshot } from './services.js';
export const loadHortifruti = () => readHortifruti();
export { readHortifrutiPage as loadHortifrutiPage } from './services.js';
export const getHortifruti = (id) => getHortifrutiSnapshot(id);
export function queryHortifruti({ query = '', status = 'pending', start = '', end = '' } = {}) {
  const needle = normalizeSearch(query);
  return listHortifrutiSnapshots().filter(
    (r) =>
      (!status || r.status === status) &&
      (!start || r.date >= start) &&
      (!end || r.date <= end) &&
      (!needle || normalizeSearch([r.partner.name, r.notes, ...r.items.map((i) => i.name)].join(' ')).includes(needle)),
  );
}

export { readHortifrutiRecord as loadHortifrutiDetail } from './services.js';
