import { renderDesign, validateCanvasSize } from './renderer.js';

/** Export from an independent full-resolution canvas, never the editor preview. */
export async function createPngBlob(design) {
  validateCanvasSize(design?.width, design?.height);
  const canvas = document.createElement('canvas');
  await renderDesign(canvas, design);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob?.size) resolve(blob);
        else reject(new Error('Não foi possível gerar o PNG. Reduza o tamanho do encarte e tente novamente.'));
      }, 'image/png');
    } catch (error) {
      reject(new Error(`Não foi possível exportar o PNG: ${error.message}`));
    }
  });
}

export async function createLayerPngBlob(element) {
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.ceil(element.width)),
    height = Math.max(1, Math.ceil(element.height));
  await renderDesign(
    canvas,
    {
      width,
      height,
      bgColor: '#ffffff',
      elements: [{ ...element, x: 0, y: 0, rotation: 0, hidden: false, opacity: 1 }],
    },
    { transparent: true },
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob?.size ? resolve(blob) : reject(Error('Não foi possível gerar o PNG desta camada.'))),
      'image/png',
    ),
  );
}

export async function embedDesignAssets(design) {
  const copy = structuredClone(design),
    cache = new Map();
  const embedded = (src) => {
    if (!cache.has(src))
      cache.set(
        src,
        (async () => {
          const response = await fetch(src);
          if (!response.ok) throw Error('Não foi possível incluir os PNGs no backup. Tente novamente.');
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(Error('Não foi possível preparar uma imagem do backup.'));
            reader.readAsDataURL(blob);
          });
        })(),
      );
    return cache.get(src);
  };
  for (const element of copy.elements) {
    if (element.type === 'image' && element.src.startsWith('./assets/')) element.src = await embedded(element.src);
    if (element.type === 'product' && element.image.startsWith('./assets/'))
      element.image = await embedded(element.image);
  }
  return copy;
}

export function downloadBlob(blob, filename = 'encarte.png') {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('O arquivo de exportação está vazio.');
  const mime = blob.type.split(';')[0].trim();
  const extension = mime === 'application/json' ? '.json' : mime === 'application/pdf' ? '.pdf' : '.png';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    String(filename)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\.(?:png|json|pdf)$/i, '') + extension;
  anchor.style.display = 'none';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Keep the object URL alive long enough for browsers to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
