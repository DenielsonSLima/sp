import { getDataContext, subscribeResource } from '../../shared/data/api.js';
import { flyerService } from './services.js';
import { readFlyerMetadata, readFlyerRecord } from './queries.js';
import { validateDesign, newId, MAX_JSON_BYTES } from './model.js';

// Preview reads never change the version of the document opened for editing.
export function createFlyerRepository({
  context = getDataContext,
  list = readFlyerMetadata,
  read = readFlyerRecord,
  save = flyerService.save,
  remove = flyerService.remove,
} = {}) {
  let scope = '',
    epoch = 0;
  const versions = new Map(),
    documents = new Map(),
    deleted = new Set();
  const current = () => {
    const value = context();
    const key = `${value?.companyId || ''}:${value?.user?.id || ''}`;
    if (key !== scope) {
      scope = key;
      epoch++;
      versions.clear();
      documents.clear();
      deleted.clear();
    }
    return key + ':' + epoch;
  };
  const ensure = (expected) => {
    if (current() !== expected) throw Error('A sessão ou empresa ativa mudou. Abra a arte novamente.');
  };
  const cache = (record) => {
    if (record?.id && Array.isArray(record.elements)) documents.set(record.id, structuredClone(record));
    return record;
  };
  const summaries = (rows) =>
    rows.map((record) =>
      Object.fromEntries(
        ['id', 'title', 'status', 'width', 'height', 'createdAt', 'updatedAt', 'expiresAt', '_version', 'publication']
          .filter((key) => record[key] !== undefined)
          .map((key) => [key, record[key]]),
      ),
    );
  return {
    clear() {
      scope = '';
      epoch++;
      versions.clear();
      documents.clear();
      deleted.clear();
    },
    async saveDesign(design) {
      const expected = current();
      if (deleted.has(design.id)) throw Error('Esta arte foi excluída. Crie uma nova arte para continuar.');
      const saved = await save(validateDesign(design), {
        expectedVersion: versions.get(design.id) ?? design._version ?? null,
        previous: documents.get(design.id),
      });
      ensure(expected);
      versions.set(saved.id, saved._version);
      cache(saved);
      return saved;
    },
    async listDesigns() {
      const expected = current(),
        rows = await list();
      ensure(expected);
      rows.forEach(cache);
      const ids = new Set(rows.map((row) => row.id));
      for (const id of documents.keys()) if (!ids.has(id)) documents.delete(id);
      return rows;
    },
    async listDesignSummaries() {
      return summaries(await this.listDesigns());
    },
    async getDesign(id, { preview = false, expectedVersion } = {}) {
      const expected = current();
      if (deleted.has(id)) throw Error('Esta arte foi excluída.');
      let record = preview && documents.get(id) ? structuredClone(documents.get(id)) : null;
      if (!record || (expectedVersion !== undefined && record._version !== expectedVersion)) record = await read(id);
      ensure(expected);
      if (!record) throw Error('Esta arte não está mais disponível.');
      if (preview && expectedVersion !== undefined && record._version !== expectedVersion)
        throw Error('A arte mudou durante o carregamento da prévia.');
      cache(record);
      if (!preview) versions.set(id, record._version);
      return record;
    },
    async deleteDesign(id, { expectedVersion } = {}) {
      const expected = current();
      const result = await remove(id, { expectedVersion: expectedVersion ?? versions.get(id) ?? null });
      ensure(expected);
      deleted.add(id);
      versions.delete(id);
      documents.delete(id);
      return result;
    },
  };
}
const repository = createFlyerRepository();
subscribeResource('flyers', () => {
  if (!getDataContext()) repository.clear();
});
export const saveDesign = (design) => repository.saveDesign(design);
export const listDesigns = () => repository.listDesigns();
export const listDesignSummaries = () => repository.listDesignSummaries();
export const getDesign = (id, options) => repository.getDesign(id, options);
export const deleteDesign = (id, options) => repository.deleteDesign(id, options);
export function exportDesignJson(design) {
  return JSON.stringify(validateDesign(design));
}
export function parseDesignJson(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_JSON_BYTES)
    throw new Error('O backup deve ser um JSON de até 25 MB.');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não contém um JSON válido.');
  }
  const design = validateDesign(value),
    now = new Date().toISOString();
  return { ...design, id: newId(), status: 'draft', createdAt: now, updatedAt: now };
}
