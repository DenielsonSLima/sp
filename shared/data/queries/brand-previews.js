export function createBrandPreviewQueries({ rpc, queryClient, requireContext, getGeneration, ensureGeneration }) {
  return async function getBrandAssetPreview(id, expectedVersion) {
    const company = requireContext().companyId;
    const current = getGeneration();
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw Error('Atualize a biblioteca antes de carregar a prévia.');
    const result = await queryClient.fetchQuery({
      queryKey: ['sp', company, 'brand_assets', 'preview', String(id), expectedVersion],
      staleTime: Infinity,
      gcTime: 600_000,
      queryFn: async ({ signal }) => {
        const row = await rpc('sp_brand_asset_preview', {
          p_company_id: company,
          p_id: String(id),
          p_expected_version: expectedVersion,
        }, { signal });
        ensureGeneration(current);
        if (!row || row.id !== String(id) || row._version !== expectedVersion)
          throw Error('A biblioteca mudou. Atualize a pasta.');
        return row;
      },
    });
    ensureGeneration(current);
    return { ...result };
  };
}
