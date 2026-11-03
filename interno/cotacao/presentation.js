import { escapeHtml } from '../../shared/ui.js';
import { icon } from '../../shared/icons.js';
import { isPhotoData } from '../cadastros/produtos/photo.js';

const providerPalette = [
  '#a61b35',
  '#1769aa',
  '#26734d',
  '#8752ad',
  '#ad5b12',
  '#177b83',
  '#ac3973',
  '#576327',
  '#5e61b5',
  '#87544b',
  '#426b91',
  '#725e18',
];

export function providerPresentation(providers) {
  const count = providers.length;
  const limit = count <= 2 ? 28 : count <= 4 ? 18 : count <= 6 ? 12 : 8;
  const columnWidth = count <= 2 ? 210 : count <= 4 ? 184 : count <= 6 ? 164 : 152;
  return {
    columnWidth,
    providers: providers.map((provider, index) => {
      const name = String(provider.name || '')
          .trim()
          .replace(/\s+/g, ' '),
        letters = Array.from(name);
      const label =
        letters.length <= limit
          ? name
          : letters
              .slice(0, limit - 1)
              .join('')
              .trimEnd() + '…';
      return {
        ...provider,
        name,
        label,
        code: `F${index + 1}`,
        color: providerPalette[index % providerPalette.length],
      };
    }),
  };
}

export function quoteProductPhoto(product, name = product?.name || 'produto') {
  const photo = [product?.photos?.[0], product?.photo].find((value) => value && isPhotoData(value));
  return photo
    ? `<div class="quote-product-photo"><img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(name)}" loading="lazy" width="56" height="56"></div>`
    : `<div class="quote-product-photo quote-product-photo-empty" role="img" aria-label="Sem foto de ${escapeHtml(name)}">${icon('cadastros')}</div>`;
}

export const providerDot = (provider) =>
  `<span class="quote-provider-dot" style="background:${provider.color}" aria-hidden="true"></span>`;
