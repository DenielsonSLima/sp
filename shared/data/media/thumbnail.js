// Presentation-only derivative. Original uploads and document snapshots remain unchanged.
export async function createProductThumbnail(source) {
  if (!globalThis.document?.createElement || !globalThis.Image) return null;
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw Error('Não foi possível preparar a miniatura.');
    for (const size of [256, 192]) {
      const scale = Math.min(1, size / Math.max(picture.naturalWidth, picture.naturalHeight));
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL('image/png');
      if (preview.length <= 262144) return preview;
    }
    throw Error('A miniatura ultrapassou o limite de tamanho.');
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}
