import { getRecord } from '../../../shared/data/api.js';
import { loadCampaignPage, loadCampaignDetail } from '../../promocoes/queries.js';
import { materializeProductPhoto } from '../../cadastros/produtos/photo.js';

export async function campaignChoices(isCurrent = () => true) {
  const rows = [];
  let page = 1, pages = 1;
  do {
    const result = await loadCampaignPage({ page, perPage: 50, status: '' });
    if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
    rows.push(...result.items);
    pages = result.pages;
    page++;
  } while (page <= pages);
  return rows;
}

export async function readCampaignWithPhotos(id, isCurrent = () => true) {
  const campaign = await loadCampaignDetail(id);
  if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
  if (!campaign) throw Error('Esta promoção não está mais disponível.');
  const ids = [...new Set(campaign.items.map(item => item.productId))];
  const products = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, ids.length) }, async () => {
    while (next < ids.length) {
      if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
      const productId = ids[next++];
      const product = await getRecord('products', productId);
      if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
      products.set(productId, product);
    }
  }));
  return { campaign, products };
}

export function productPhotos(product) {
  return product?.photos?.length ? product.photos : product?.photo ? [product.photo] : [];
}

export async function selectedPhotos(products, choices, isCurrent = () => true) {
  const photos = new Map(), entries = [...products.entries()];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, entries.length) }, async () => {
    while (next < entries.length) {
      if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
      const [id, product] = entries[next++];
      const available = productPhotos(product);
      const source = available[choices.get(id) || 0] || available[0] || '';
      const photo = await materializeProductPhoto(source);
      if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
      photos.set(id, photo);
    }
  }));
  return photos;
}
