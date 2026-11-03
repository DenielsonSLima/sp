const clone = (value) => structuredClone(value);
const pagedResources = new Set([
  'quotes', 'hortifruti_receipts', 'butcher_receipts', 'supplier_returns', 'campaigns', 'price_tables',
]);

export function createPageQueries({ rpc, queryClient, requireContext, resourceKey, getGeneration, ensureGeneration, invalidate }) {
  async function listResourcePage(resource, {
    page = 1, perPage = 20, query = '', status = '', start = '', end = '', category = '', archived = 'active', force = false,
  } = {}) {
    if (!pagedResources.has(resource)) throw Error('Este recurso não possui listagem resumida.');
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 50)
      throw Error('Página inválida.');
    const company = requireContext().companyId, current = getGeneration();
    const filters = { page, perPage, query: String(query), status: String(status), start: String(start),
      end: String(end), category: String(category), archived: String(archived) };
    const queryKey = [...resourceKey(resource), 'page', filters];
    if (force) await queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    const result = await queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => rpc('sp_resource_page', {
        p_company_id: company, p_resource: resource, p_page: page, p_per_page: perPage,
        p_query: filters.query, p_status: filters.status, p_start: filters.start, p_end: filters.end,
        p_category: filters.category, p_archived: filters.archived,
      }, { signal }),
    });
    ensureGeneration(current);
    if (!result || !Array.isArray(result.items) || result.items.length > perPage ||
      !Number.isSafeInteger(result.total) || result.total < 0 || !Number.isSafeInteger(result.page) || result.page < 1)
      throw Error('O banco retornou uma página inválida.');
    return clone(result);
  }

  async function listCampaignCalendar({ start, end } = {}) {
    const company = requireContext().companyId, current = getGeneration();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
      throw Error('Informe o período do calendário.');
    const result = await queryClient.fetchQuery({
      queryKey: [...resourceKey('campaigns'), 'calendar', start, end],
      queryFn: ({ signal }) => rpc('sp_campaign_calendar', { p_company_id: company, p_start: start, p_end: end }, { signal }),
    });
    ensureGeneration(current);
    if (!Array.isArray(result)) throw Error('O banco retornou campanhas inválidas.');
    return clone(result);
  }

  async function updateBrandAssetMetadata(id, { name, category, _version: expectedVersion } = {}) {
    const company = requireContext().companyId, current = getGeneration();
    const result = await rpc('sp_brand_asset_metadata_update', {
      p_company_id: company, p_id: String(id), p_name: name, p_category: category, p_expected_version: expectedVersion,
    });
    ensureGeneration(current);
    await invalidate('brand_assets');
    ensureGeneration(current);
    return clone(result);
  }

  return { listResourcePage, listCampaignCalendar, updateBrandAssetMetadata };
}
