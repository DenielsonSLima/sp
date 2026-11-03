import { filterValues } from '../../filters.js';

const clone = (value) => structuredClone(value);
export function createProductQueries({
  rpc,
  queryClient,
  requireContext,
  resourceKey,
  ensureGeneration,
  getGeneration,
  resolveMediaBatch,
  productAliases,
  now,
}) {
  async function listProductMetadata() {
    const company = requireContext().companyId,
      current = getGeneration();
    const rows = await queryClient.fetchQuery({
      queryKey: [...resourceKey('products'), 'metadata'],
      queryFn: ({ signal }) => rpc('sp_list', { p_company_id: company, p_resource: 'products' }, { signal }),
    });
    ensureGeneration(current);
    if (!Array.isArray(rows)) throw Error('O banco retornou uma lista de produtos inválida.');
    return clone(rows);
  }
  async function listProductPage({ query = '', category = '', subcategory = '', page = 1, view = 'cards' } = {}) {
    const company = requireContext().companyId,
      current = getGeneration(),
      perPage = view === 'table' ? 25 : 20;
    if (!Number.isSafeInteger(page) || page < 1) throw Error('Página inválida.');
    const filters = {
      query: String(query),
      category: filterValues(category),
      subcategory: filterValues(subcategory),
      page,
      perPage,
    };
    const multiple = filters.category.length > 1 || filters.subcategory.length > 1;
    const result = await queryClient.fetchQuery({
      queryKey: [...resourceKey('products'), 'page', filters],
      queryFn: ({ signal }) =>
        rpc(multiple ? 'sp_product_page_filtered' : 'sp_product_page', {
          p_company_id: company,
          p_page: page,
          p_per_page: perPage,
          p_query: filters.query,
          ...(multiple
            ? { p_categories: filters.category, p_subcategories: filters.subcategory }
            : { p_category: filters.category[0] || '', p_subcategory: filters.subcategory[0] || '' }),
        }, { signal }),
    });
    ensureGeneration(current);
    if (
      !result ||
      !Array.isArray(result.items) ||
      result.items.length > perPage ||
      !Number.isInteger(result.total) ||
      !Number.isInteger(result.page) ||
      result.page < 1
    )
      throw Error('O banco retornou uma página de produtos inválida.');
    return clone(result);
  }
  async function loadProductPreviews(rows, { onBatch = () => {}, isCurrent = () => true } = {}) {
    const company = requireContext().companyId,
      current = getGeneration();
    if (!Array.isArray(rows) || rows.length > 25) throw Error('Carregue apenas as fotos da página atual.');
    const key = (row) => ['sp', company, 'product_preview', row.id, row._version];
    const emit = (batch) => {
      if (isCurrent()) onBatch(batch.map((row) => productAliases(row, queryClient.getQueryData(key(row)))));
    };
    const missing = [];
    for (const row of rows) {
      const cached = queryClient.getQueryData(key(row));
      if (cached?.expiresAt > now()) emit([row]);
      else if (row.hasPhotos) missing.push(row);
      else {
        await resolveMediaBatch([{ ...row, photos: [], photoAssets: [], _mediaCacheKey: key(row) }], company, current);
        emit([row]);
      }
    }
    const batches = [];
    for (let index = 0; index < missing.length; index += 4) batches.push(missing.slice(index, index + 4));
    let next = 0;
    const worker = async () => {
      while (next < batches.length && isCurrent()) {
        ensureGeneration(current);
        const batch = batches[next++];
        const identities = batch.map((row) => [row.id, row._version]).sort(([a], [b]) => a.localeCompare(b));
        await queryClient.fetchQuery({
          queryKey: ['sp', company, 'product_preview_load', identities],
          staleTime: 0,
          gcTime: 0,
          queryFn: async () => {
            const media = await rpc('sp_product_previews', {
              p_company_id: company, p_ids: identities.map(([id]) => id),
            });
            ensureGeneration(current);
            if (!Array.isArray(media) || media.length !== batch.length || new Set(media.map((item) => item.id)).size !== batch.length)
              throw Error('Não foi possível carregar as fotos desta página.');
            for (const item of media) {
              const row = batch.find((row) => row.id === item.id);
              if (!row || item._version !== row._version) {
                const error = Error('O catálogo mudou durante o carregamento.');
                error.code = 'CATALOG_CHANGED';
                throw error;
              }
              if ((item.photos ?? []).length + (item.photoAssets ?? []).length > 1)
                throw Error('A prévia deve conter somente a foto principal.');
              item._mediaCacheKey = key(row);
            }
            // Finish already-started batches for this session, even if a view left.
            // The single QueryClient deduplicates both the RPC and URL signing.
            await resolveMediaBatch(media, company, current);
            return true;
          },
        });
        ensureGeneration(current);
        emit(batch);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
    ensureGeneration(current);
  }

  return { listProductMetadata, listProductPage, loadProductPreviews };
}
