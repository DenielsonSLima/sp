export const UNCATEGORIZED = 'Sem categoria';
export const CATEGORIES = Object.freeze(['Supermercado do Povo','Cabeçalho','Marca d’água','Formas','Logos','Mascotes','Selos','Molduras','Fundos','Outros',UNCATEGORIZED]);
export function validateCategory(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Informe uma categoria de até 80 caracteres.');
  return value.trim();
}
export const categoryKey = value => validateCategory(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 20000000;
export function validateAsset(value) {
  if (!value || typeof value !== 'object') throw new Error('Elemento inválido.');
  const {id, name, category, dataURL, width, height} = value;
  if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw new Error('Identificador inválido.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Informe um nome de até 100 caracteres.');
  validateCategory(category);
  if (typeof dataURL !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataURL) || dataURL.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 30) throw new Error('Use uma imagem PNG de até 8 MB.');
  if (![width,height].every(n => Number.isInteger(n) && n > 0 && n <= 10000) || width * height > MAX_PIXELS) throw new Error('Imagem muito grande: limite de 20 megapixels e 10.000 pixels por lado.');
  return {id,name:name.trim(),category:category.trim(),dataURL,width,height};
}
export function snapshotAsset(asset) { return {...validateAsset(asset)}; }
export function filterAssets(assets, query = '', category = '') {
  const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return assets.filter(a => (!category || a.category === category) && fold(a.name).includes(fold(query.trim())));
}
export function inspectPng(bytes) {
  const signature = [137,80,78,71,13,10,26,10];
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || !signature.every((v,i) => bytes[i] === v) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('O arquivo não é um PNG válido.');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 10000 || height > 10000 || width * height > MAX_PIXELS) throw new Error('PNG excede o limite de dimensões permitido.');
  return {width,height};
}
export async function assetFromFile(file, category = UNCATEGORIZED) {
  if (!file || file.size > MAX_FILE_BYTES || !file.size) throw new Error('Cada PNG deve ter até 8 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = inspectPng(bytes);
  const dataURL = await new Promise((resolve,reject) => {const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result).replace(/^data:[^;]*;/,'data:image/png;')); reader.onerror=()=>reject(new Error('Não foi possível ler o PNG.')); reader.readAsDataURL(file);});
  await new Promise((resolve,reject) => { const img = new Image(); img.onload=()=>img.naturalWidth === dimensions.width && img.naturalHeight === dimensions.height ? resolve() : reject(new Error('Dimensões PNG inconsistentes.')); img.onerror=()=>reject(new Error('O PNG está danificado ou não pode ser aberto.')); img.src=dataURL; });
  return validateAsset({id:crypto.randomUUID(),name:file.name.replace(/\.png$/i,'').slice(0,100) || 'Novo elemento',category,dataURL,...dimensions});
}
