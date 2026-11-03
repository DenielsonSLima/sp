import { createRealtimeTransport } from './realtime.js';
import { fetchPartnerCnpj } from './partner-lookup.js';
import { QueryClient } from '@tanstack/query-core';
import { getSupabase } from './client.js';
import { resources, resourceSet } from './resources.js';
import { createMutationEcho } from './mutation-echo.js';
import { createPageQueries } from './queries/pages.js';
import { createProductMedia } from './media/products.js';
import { createSnapshotMedia } from './media/snapshots.js';
import { createProductQueries } from './queries/products.js';
import { createRecordQueries } from './queries/records.js';
import { createBrandPreviewQueries } from './queries/brand-previews.js';
import { isTransientAccessError } from './access-errors.js';
export { resources } from './resources.js';
export { PRODUCT_SIGNED_URL_SECONDS, PRODUCT_MEDIA_CACHE_MS } from './media/products.js';

const clone = (value) => structuredClone(value);

export function createDataApi({
  client,
  cnpjLookup = fetchPartnerCnpj,
  now = () => Date.now(),
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 300_000, retry: false, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  }),
} = {}) {
  let context = null,
    generation = 0,
    contextRequest = null;
  const listeners = new Map();
  let accessRefresh = null;
  const supabase = () => client ?? getSupabase();
  const resourceKey = (resource) => ['sp', requireContext().companyId, resource];
  function requireContext() {
    if (!context?.companyId) throw Error('Entre com uma conta autorizada e selecione uma empresa.');
    return context;
  }
  function checkResource(resource) {
    if (!resourceSet.has(resource)) throw Error('Recurso de dados desconhecido.');
  }
  const echo = createMutationEcho({ onUncertainChange: invalidate });
  const mutationResources = {
    sp_flyer_save_delta: 'flyers',
    sp_flyer_save: 'flyers', sp_product_gallery: 'products', sp_product_thumbnail_save: 'products',
    sp_brand_asset_metadata_update: 'brand_assets',
  };
  async function rpc(name, params = {}, { signal } = {}) {
    let request = supabase().rpc(name, params);
    const resource = mutationResources[name] ?? (['sp_save', 'sp_delete', 'sp_command'].includes(name) ? params.p_resource : null);
    const mutationId = resource && request.setHeader ? echo.begin(resource) : null;
    if (mutationId) request = request.setHeader('x-sp-mutation-id', mutationId);
    if (signal && request.abortSignal) request = request.abortSignal(signal);
    try {
      const { data, error, status } = await request;
      if (error) {
        const e = Error(error.message || 'Não foi possível concluir a operação no banco.');
        e.code = error.code;
        e.details = error.details;
        e.status = status;
        throw e;
      }
      if (mutationId) echo.finish(mutationId, true);
      return data;
    } catch (error) {
      if (mutationId) echo.finish(mutationId, false);
      throw error;
    }
  }
  function ensureGeneration(current) {
    if (generation !== current) throw Error('A sessão mudou durante o carregamento das fotos.');
  }
  const dependencies = {
    supabase,
    rpc,
    queryClient,
    requireContext,
    resourceKey,
    checkResource,
    ensureGeneration,
    invalidate,
    now,
    getGeneration: () => generation,
  };
  const getBrandAssetPreview = createBrandPreviewQueries(dependencies);
  const { listResourcePage, listCampaignCalendar, updateBrandAssetMetadata } = createPageQueries(dependencies);
  const media = createProductMedia(dependencies);
  const {
    hydrateProductMedia,
    resolveMediaBatch,
    productAliases,
    productWriteRecord,
    uploadProductPhoto,
    saveProductGallery,
    resetMediaRefresh,
  } = media;
  const { hydrateSnapshotMedia, snapshotWritePayload } = createSnapshotMedia({ ...dependencies, resolveMediaBatch });
  const { listProductMetadata, listProductPage, loadProductPreviews } = createProductQueries({
    ...dependencies,
    resolveMediaBatch,
    productAliases,
  });
  const {
    listRecords,
    lookupPartnerCnpj,
    listFlyerLibrary,
    getRecord,
    saveRecord,
    saveFlyerSnapshot,
    deleteRecord,
    command,
    calculate,
  } = createRecordQueries({
    ...dependencies,
    cnpjLookup,
    hydrateProductMedia,
    hydrateSnapshotMedia,
    snapshotWritePayload,
    productWriteRecord,
  });
  const transport = createRealtimeTransport({
    supabase,
    getGeneration: () => generation,
    onResourceChanged: invalidate,
    handlesMutation: (resource, id) => echo.handles(resource, id),
    onAccessChanged: refreshAccess,
    resourceNames: () => listeners.keys(),
  });
  function notify(resource) {
    for (const callback of listeners.get(resource) ?? []) {
      try {
        Promise.resolve(callback()).catch((error) => console.error(error));
      } catch (error) {
        console.error(error);
      }
    }
  }
  async function invalidate(resource, { refetchType = 'active', preserveRecordId } = {}) {
    const company = context?.companyId;
    if (!company) return;
    // Product media keys include id + immutable record version. Revalidate metadata
    // to pick the new version, retaining unchanged images until their URLs expire.
    // Snapshot media keys include immutable paths. Changes to prices/documents
    // must not discard still-valid URLs for unrelated photos.
    await queryClient.invalidateQueries({
      queryKey: ['sp', company, resource],
      refetchType,
      // Preview keys include the immutable record version. Refresh metadata to select the new key.
      predicate: (query) => !(resource === 'brand_assets' && query.queryKey[3] === 'preview') &&
        !(preserveRecordId !== undefined && query.queryKey[3] === 'detail' && query.queryKey[4] === preserveRecordId),
    });
    notify(resource);
  }
  async function stopRealtime() {
    resetMediaRefresh();
    return transport.stop();
  }
  async function setContext(next) {
    const requestGeneration = ++generation;
    context = null;
    echo.clear();
    try {
      await stopRealtime();
    } catch (error) {
      console.error('Não foi possível encerrar o canal anterior.', error);
    }
    if (generation !== requestGeneration) return;
    await queryClient.cancelQueries();
    if (generation !== requestGeneration) return;
    queryClient.clear();
    // Clear each module's mirror before accepting a different identity/company.
    for (const resource of listeners.keys()) notify(resource);
    context = next?.companyId ? clone(next) : null;
    if (!context) return;
    transport.start(context);
  }

  async function fetchContext(companyId) {
    const requestedGeneration = generation;
    const result = await rpc('sp_context');
    if (requestedGeneration !== generation) throw Error('A sessão mudou durante o carregamento da empresa.');
    const companies = result?.companies ?? [];
    const chosen = companyId
      ? companies.find((c) => c.id === companyId)
      : (companies.find((c) => c.id === result?.companyId) ?? companies[0]);
    if (companyId && !chosen) throw Error('Você não tem acesso a esta empresa.');
    if (!chosen) {
      await setContext(null);
      throw Error('Sua conta ainda não possui acesso a uma empresa. Solicite o vínculo ao administrador.');
    }
    const next = { ...result, companyId: chosen.id, company: chosen };
    if (
      context?.companyId === next.companyId &&
      context?.user?.id === next.user?.id &&
      JSON.stringify(context?.companies) === JSON.stringify(next.companies)
    ) {
      context = clone(next);
      return clone(next);
    }
    const expectedGeneration = generation + 1;
    await setContext(next);
    if (generation !== expectedGeneration) throw Error('A sessão mudou durante a seleção da empresa.');
    return clone(next);
  }
  function loadContext(companyId) {
    if (contextRequest && contextRequest.companyId === companyId && contextRequest.generation === generation)
      return contextRequest.promise;
    const request = { companyId, generation };
    request.promise = fetchContext(companyId).finally(() => {
      if (contextRequest === request) contextRequest = null;
    });
    contextRequest = request;
    return request.promise;
  }
  function refreshAccess() {
    if (accessRefresh?.generation === generation) return accessRefresh.promise;
    const company = context?.companyId;
    if (!company) return Promise.resolve();
    const previous = JSON.stringify(context);
    const request = { generation };
    request.promise = loadContext(company)
      .then((validated) => {
        if (JSON.stringify(validated) !== JSON.stringify(context)) return;
        if (previous !== JSON.stringify(context) && typeof window !== 'undefined')
          window.dispatchEvent(new Event('sp:access-changed'));
      })
      .catch(async (error) => {
        // A failed check from a former session must never clear the new one.
        if (request.generation !== generation) return;
        if (isTransientAccessError(error)) {
          console.error('Não foi possível revalidar o acesso agora; a sessão atual foi preservada.', error);
          return;
        }
        await setContext(null);
        if (generation === request.generation + 1 && typeof window !== 'undefined')
          window.dispatchEvent(new Event('sp:access-changed'));
        console.error('O acesso à empresa precisa ser revalidado.', error);
      })
      .finally(() => {
        if (accessRefresh === request) accessRefresh = null;
      });
    accessRefresh = request;
    return request.promise;
  }
  function subscribeResource(resource, callback) {
    checkResource(resource);
    if (!listeners.has(resource)) listeners.set(resource, new Set());
    listeners.get(resource).add(callback);
    return () => {
      listeners.get(resource)?.delete(callback);
    };
  }
  const getDataContext = () => (context ? clone(context) : null);
  const { subscribeConnection } = transport;

  return {
    queryClient,
    rpc,
    setContext,
    loadContext,
    refreshAccess,
    getDataContext,
    listRecords,
    listResourcePage,
    listCampaignCalendar,
    updateBrandAssetMetadata,
    lookupPartnerCnpj,
    listFlyerLibrary,
    listProductMetadata,
    listProductPage,
    loadProductPreviews,
    getRecord,
    getBrandAssetPreview,
    saveRecord,
    saveFlyerSnapshot,
    deleteRecord,
    calculate,
    command,
    uploadProductPhoto,
    saveProductGallery,
    subscribeResource,
    subscribeConnection,
    invalidate,
    stopRealtime,
  };
}
const api = createDataApi();
export const {
  queryClient,
  loadContext,
  setContext,
  refreshAccess,
  getDataContext,
  listRecords,
  listResourcePage,
  listCampaignCalendar,
  updateBrandAssetMetadata,
  lookupPartnerCnpj,
  listFlyerLibrary,
  listProductMetadata,
  listProductPage,
  loadProductPreviews,
  getRecord,
  getBrandAssetPreview,
  saveRecord,
  saveFlyerSnapshot,
  deleteRecord,
  calculate,
  command,
  uploadProductPhoto,
  saveProductGallery,
  subscribeResource,
  subscribeConnection,
} = api;
