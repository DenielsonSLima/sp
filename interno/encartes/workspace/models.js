import { listDesignSummaries, getDesign } from '../storage.js';
import { FLYER_MODEL_PRESETS, createBlankFlyerModel, isFlyerModel, validateFlyerModel } from '../modelos/model.js';

export function readWorkspaceSelection(hash = '') {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const safe = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : '';
  return { campaignId: safe(params.get('promocao')), modelId: safe(params.get('modelo')) };
}

export async function modelChoices(isCurrent = () => true) {
  const rows = await listDesignSummaries();
  if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
  return rows.filter(isFlyerModel).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

export async function readWorkspaceModel(key, options, isCurrent = () => true) {
  if (key.startsWith('preset:')) {
    const presetId = key.slice(7);
    if (!FLYER_MODEL_PRESETS.some(preset => preset.id === presetId)) throw Error('Modelo não encontrado.');
    return createBlankFlyerModel({ presetId, templateId: options.templateId, formatId: options.formatId });
  }
  if (!isFlyerModel(key)) throw Error('Escolha um modelo de encarte válido.');
  const model = await getDesign(key, { preview: true, fresh: true });
  if (!isCurrent()) throw Error('A tela ou a sessão mudou.');
  return { ...validateFlyerModel(model), _version: model._version };
}

export function modelPublicationOptions(state) {
  return state.modelKey.startsWith('preset:')
    ? { ...state.options, themeId: state.modelKey.slice(7) }
    : { templateId: state.modelKey, themeId: 'custom', formatId: 'custom' };
}
