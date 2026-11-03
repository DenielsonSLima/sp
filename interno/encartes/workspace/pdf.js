import { createPdfBytes, MAX_PDF_PAGES, MAX_CANVAS_PIXELS, PDF_DPI } from '../../promocoes/pdf.js';
import { renderDesign, validateCanvasSize } from '../renderer.js';

export const MAX_FLYER_PDF_BYTES = 100 * 1024 * 1024;
const FORMATS = new Set(['portrait', 'story', 'a4']);
const PX_TO_MM = 25.4 / 96;

/** One publication per file; keep page order and preserve every artwork's aspect ratio. */
export function planFlyerPdf(pages) {
  if (!Array.isArray(pages) || !pages.length) throw Error('Adicione páginas ao encarte antes de exportar.');
  if (pages.length > MAX_PDF_PAGES) throw Error('Exporte no máximo 200 páginas por vez.');
  const first = pages[0], formatId = first?.publication?.formatId;
  if (!FORMATS.has(formatId)) throw Error('O formato do encarte é inválido.');
  validateCanvasSize(first.width, first.height);
  const [widthMm, heightMm] = formatId === 'a4'
    ? (first.width > first.height ? [297, 210] : [210, 297])
    : [first.width * PX_TO_MM, first.height * PX_TO_MM];
  return {
    widthMm,
    heightMm,
    pages: pages.map((design) => {
      validateCanvasSize(design?.width, design?.height);
      if (!Array.isArray(design.elements)) throw Error('Uma página do encarte é inválida.');
      if (design.publication?.formatId !== formatId || design.width !== first.width || design.height !== first.height)
        throw Error('Exporte juntas apenas páginas do mesmo formato e tamanho.');
      const fit = Math.min(widthMm / design.width, heightMm / design.height);
      const imageWidthMm = design.width * fit, imageHeightMm = design.height * fit;
      return [{
        offer: design,
        xMm: (widthMm - imageWidthMm) / 2,
        yMm: (heightMm - imageHeightMm) / 2,
        widthMm: imageWidthMm,
        heightMm: imageHeightMm,
      }];
    }),
  };
}

function assertCurrent(isCurrent) {
  if (!isCurrent()) throw Error('A exportação foi cancelada porque a tela ou a sessão mudou.');
}

async function renderPageJpeg(design, placement, remainingBytes, isCurrent) {
  const canvas = document.createElement('canvas');
  try {
    const scale = design.publication.formatId === 'a4'
      ? Math.min(
        placement.widthMm * PDF_DPI / 25.4 / design.width,
        placement.heightMm * PDF_DPI / 25.4 / design.height,
        4096 / design.width,
        4096 / design.height,
        Math.sqrt(MAX_CANVAS_PIXELS / (design.width * design.height)),
      )
      : 1;
    await renderDesign(canvas, design, { scale });
    assertCurrent(isCurrent);
    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob(resolve, 'image/jpeg', 0.96);
      } catch (error) {
        reject(Error(`Não foi possível preparar uma página do PDF: ${error.message}`));
      }
    });
    assertCurrent(isCurrent);
    if (!blob?.size || blob.type !== 'image/jpeg') throw Error('Não foi possível gerar a imagem de uma página do PDF.');
    if (blob.size > remainingBytes) throw Error('O PDF ultrapassa 100 MB. Exporte menos páginas por vez.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assertCurrent(isCurrent);
    return { bytes, width: canvas.width, height: canvas.height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Export fully rendered pages sequentially, releasing the canvas before the next page. */
export async function createFlyerPdf(pages, { isCurrent = () => true, onProgress = () => {} } = {}) {
  assertCurrent(isCurrent);
  const group = planFlyerPdf(pages);
  if (typeof document === 'undefined') throw Error('A exportação PDF precisa de um navegador com Canvas.');
  const images = new Map();
  let totalBytes = 0;
  try {
    for (let index = 0; index < group.pages.length; index++) {
      assertCurrent(isCurrent);
      const placement = group.pages[index][0];
      const image = await renderPageJpeg(placement.offer, placement, MAX_FLYER_PDF_BYTES - totalBytes, isCurrent);
      images.set(placement.offer, image);
      totalBytes += image.bytes.length;
      onProgress(index + 1, group.pages.length);
    }
    assertCurrent(isCurrent);
    const bytes = createPdfBytes(group, images);
    if (bytes.byteLength > MAX_FLYER_PDF_BYTES) throw Error('O PDF ultrapassa 100 MB. Exporte menos páginas por vez.');
    assertCurrent(isCurrent);
    return new Blob([bytes], { type: 'application/pdf' });
  } finally {
    images.clear();
  }
}
