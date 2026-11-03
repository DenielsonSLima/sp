import { isUncertainFlyerSave } from '../../../shared/data/flyer-write.js';

export function saveErrorMessage(error) {
  if (isUncertainFlyerSave(error))
    return 'O envio foi interrompido e não foi possível confirmar o salvamento. Sua arte continua aberta. Use Tentar novamente; não recarregue a página.';
  if (error?.code === '57014')
    return 'O banco demorou para salvar. Suas alterações continuam abertas; use Tentar novamente.';
  return error?.message || 'Não foi possível salvar a arte. Tente novamente.';
}
