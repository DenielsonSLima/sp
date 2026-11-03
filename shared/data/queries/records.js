import { snapshotResources } from '../resources.js';
import { compactFlyerWrite, confirmsFlyerWrite, isUncertainFlyerSave } from '../flyer-write.js';
const clone = (value) => structuredClone(value);
export function createRecordQueries({
  rpc,
  queryClient,
  requireContext,
  resourceKey,
  checkResource,
  ensureGeneration,
  invalidate,
  getGeneration,
  cnpjLookup,
  hydrateProductMedia,
  hydrateSnapshotMedia,
  snapshotWritePayload,
  productWriteRecord,
}) {
  async function listRecords(resource, { force = false } = {}) {
    checkResource(resource);
    const company = requireContext().companyId,
      current = getGeneration();
    const key = resourceKey(resource);
    if (force) await queryClient.invalidateQueries({ queryKey: key });
    const data = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async ({ signal }) => {
        let records =
          resource === 'brand_assets'
            ? await rpc('sp_brand_asset_metadata', { p_company_id: company }, { signal })
            : await rpc('sp_list', { p_company_id: company, p_resource: resource }, { signal });
        if (!Array.isArray(records)) throw Error('O banco retornou uma lista inválida.');
        if (resource === 'products') {
          try {
            return await hydrateProductMedia(records, company, current);
          } catch (error) {
            if (error.code !== 'CATALOG_CHANGED') throw error;
            records = await rpc('sp_list', { p_company_id: company, p_resource: resource }, { signal });
            if (!Array.isArray(records)) throw Error('O banco retornou uma lista inválida.');
            return hydrateProductMedia(records, company, current);
          }
        }
        return snapshotResources.has(resource) ? hydrateSnapshotMedia(resource, records, company, current) : records;
      },
    });
    if (getGeneration() !== current) throw Error('A sessão mudou durante o carregamento.');
    return clone(data);
  }
  async function lookupPartnerCnpj(input) {
    const company = requireContext().companyId,
      current = getGeneration();
    const cnpj = await rpc('sp_partner_cnpj', { p_company_id: company, p_cnpj: String(input ?? '') });
    ensureGeneration(current);
    const result = await queryClient.fetchQuery({
      queryKey: ['sp', company, 'partner_cnpj', cnpj],
      staleTime: 86_400_000,
      queryFn: ({ signal }) => cnpjLookup(cnpj, { signal }),
    });
    ensureGeneration(current);
    return clone(result);
  }
  async function listFlyerLibrary({ force = false } = {}) {
    const company = requireContext().companyId,
      current = getGeneration(),
      key = [...resourceKey('flyers'), 'metadata'];
    if (force) await queryClient.invalidateQueries({ queryKey: key });
    const rows = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => rpc('sp_flyer_library', { p_company_id: company }, { signal }),
    });
    ensureGeneration(current);
    if (!Array.isArray(rows)) throw Error('O banco retornou uma biblioteca de artes inválida.');
    return clone(rows);
  }
  async function getRecord(resource, id) {
    checkResource(resource);
    const company = requireContext().companyId,
      current = getGeneration();
    const result = await queryClient.fetchQuery({
      queryKey: [...resourceKey(resource), 'detail', String(id)],
      queryFn: async ({ signal }) => {
        const row = await rpc('sp_get', { p_company_id: company, p_resource: resource, p_id: String(id) }, { signal });
        return resource === 'products' && row
          ? (await hydrateProductMedia([row], company, current))[0]
          : snapshotResources.has(resource) && row
            ? hydrateSnapshotMedia(resource, row, company, current)
            : row;
      },
    });
    if (getGeneration() !== current) throw Error('A sessão mudou durante o carregamento.');
    return clone(result);
  }
  async function mutate(resource, name, args) {
    checkResource(resource);
    const company = requireContext().companyId,
      current = getGeneration();
    const result = await rpc(name, { p_company_id: company, p_resource: resource, ...args });
    if (getGeneration() !== current)
      throw Error('A sessão mudou durante a operação. Recarregue os dados antes de continuar.');
    if (resource === 'quotes' && name === 'sp_command' && args.p_action === 'chooseProvider') {
      // The RPC already returns the complete authoritative quote and its totals.
      // Cancel stale detail reads, seed the acknowledgement, then mark other
      // readers stale without making this click await their network requests.
      const hydrated = await hydrateSnapshotMedia(resource, result, company, current);
      const record = hydrated?.record || hydrated;
      ensureGeneration(current);
      if (record?.id !== args.p_id || !Number.isSafeInteger(record?._version))
        throw Error('O banco retornou uma confirmação de escolha inválida.');
      const key = [...resourceKey(resource), 'detail', record.id];
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      ensureGeneration(current);
      queryClient.setQueryData(key, (cached) => cached?._version > record._version ? cached : clone(record));
      await invalidate(resource, { refetchType: 'none', preserveRecordId: record.id });
      ensureGeneration(current);
      return clone(hydrated);
    }
    await invalidate(resource);
    if (getGeneration() !== current) throw Error('A sessão mudou durante a atualização. Recarregue os dados.');
    return clone(
      snapshotResources.has(resource) ? await hydrateSnapshotMedia(resource, result, company, current) : result,
    );
  }
  const saveRecord = async (resource, record, { expectedVersion = record?._version ?? null } = {}) => {
    const current = getGeneration(),
      company = requireContext().companyId;
    const result = await mutate(resource, 'sp_save', {
      p_record: resource === 'products' ? productWriteRecord(record) : record,
      p_expected_version: expectedVersion,
    });
    return resource === 'products' && result ? (await hydrateProductMedia([result], company, current))[0] : result;
  };
  async function saveFlyerSnapshot(record, { expectedVersion = record?._version ?? null, previous } = {}) {
    const company = requireContext().companyId,
      current = getGeneration();
    const payload = compactFlyerWrite(record, previous, expectedVersion);
    let ack;
    try {
      ack = await rpc(payload.imageRefs.length ? 'sp_flyer_save_delta' : 'sp_flyer_save', {
        p_company_id: company,
        p_record: payload.record,
        p_expected_version: expectedVersion,
        ...(payload.imageRefs.length ? { p_image_refs: payload.imageRefs } : {}),
      });
    } catch (error) {
      ensureGeneration(current);
      if (!isUncertainFlyerSave(error)) throw error;
      // A lost HTTP response does not prove the transaction failed. Check the
      // committed revision/content once; never replay an uncertain mutation.
      const stored = await rpc('sp_get', { p_company_id: company, p_resource: 'flyers', p_id: record.id })
        .catch(() => null);
      ensureGeneration(current);
      if (!confirmsFlyerWrite(record, stored, expectedVersion)) throw error;
      ack = { id: stored.id, _version: stored._version, createdAt: stored.createdAt, updatedAt: stored.updatedAt };
    }
    ensureGeneration(current);
    if (ack?.id !== record.id || !Number.isSafeInteger(ack?._version))
      throw Error('O banco retornou uma confirmação de arte inválida.');
    // The commit acknowledgement is sufficient. Mark readers stale and notify
    // the library without waiting for active full-image queries to download again.
    await invalidate('flyers', { refetchType: 'none' });
    ensureGeneration(current);
    return clone({ ...record, ...ack });
  }
  const deleteRecord = (resource, id, { expectedVersion = null } = {}) =>
    mutate(resource, 'sp_delete', { p_id: String(id), p_expected_version: expectedVersion });
  const command = (resource, action, id = null, payload = {}, { expectedVersion = payload?._version ?? null } = {}) =>
    mutate(resource, 'sp_command', {
      p_action: action,
      p_id: id === null ? null : String(id),
      p_payload: snapshotResources.has(resource) ? snapshotWritePayload(payload) : payload,
      p_expected_version: expectedVersion,
    });
  async function calculate(kind, input = {}) {
    const current = getGeneration();
    const result = await rpc('sp_calculate', {
      p_company_id: requireContext().companyId,
      p_kind: kind,
      p_input: input,
    });
    if (current !== getGeneration()) throw Error('A sessão mudou durante o cálculo.');
    return result;
  }

  return {
    listRecords,
    lookupPartnerCnpj,
    listFlyerLibrary,
    getRecord,
    saveRecord,
    saveFlyerSnapshot,
    deleteRecord,
    command,
    calculate,
  };
}
