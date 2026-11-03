const MAX_SIDE = 384;
const MAX_DATA_URL = 524288;

/** Geometry only: keep transparency and leave the original PNG untouched. */
export async function createAssetThumbnail(dataURL) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error('Não foi possível preparar a prévia do PNG.'));
    image.src = dataURL;
  });
  const canvas = document.createElement('canvas');
  let side = MAX_SIDE;
  while (side >= 48) {
    const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Não foi possível preparar a prévia do PNG.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/png');
    if (preview.startsWith('data:image/png;base64,') && preview.length <= MAX_DATA_URL) return preview;
    side = Math.floor(side / 2);
  }
  throw Error('Não foi possível reduzir a prévia do PNG.');
}
