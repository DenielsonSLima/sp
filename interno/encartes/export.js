import {renderDesign, validateCanvasSize} from './renderer.js';

/** Export from an independent full-resolution canvas, never the editor preview. */
export async function createPngBlob(design) {
  validateCanvasSize(design?.width, design?.height);
  const canvas = document.createElement('canvas');
  await renderDesign(canvas, design);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob?.size) resolve(blob);
        else reject(new Error('Não foi possível gerar o PNG. Reduza o tamanho do encarte e tente novamente.'));
      }, 'image/png');
    } catch (error) {
      reject(new Error(`Não foi possível exportar o PNG: ${error.message}`));
    }
  });
}

export function downloadBlob(blob, filename = 'encarte.png') {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('O arquivo de exportação está vazio.');
  const extension = blob.type.split(';')[0].trim() === 'application/json' ? '.json' : '.png';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(filename).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.(?:png|json)$/i, '') + extension;
  anchor.style.display = 'none';
  document.body.append(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Keep the object URL alive long enough for browsers to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
