import { formatWeightMicros } from './weight-input.js';
export function weighingSummary(item, purchaseUnit = '') {
  const boxes = item.weighMode === 'boxes' ? item.boxes?.length || 0 : null,
    value = item._computed;
  const countLabel =
    boxes !== null
      ? `${boxes} caixa${boxes === 1 ? '' : 's'}`
      : String(purchaseUnit).toUpperCase() === 'UN'
        ? value?.unitCount
          ? `${value.unitCount} unidade${value.unitCount === 1 ? '' : 's'}`
          : 'Unidades: —'
        : 'Caixas: —';
  if (value?.invalid)
    return {
      boxCount: boxes,
      countLabel,
      weightMicros: null,
      weightLabel: 'Verificar peso',
      incomplete: true,
      invalid: true,
    };
  return {
    boxCount: boxes,
    countLabel,
    weightMicros: value?.quantityMicros ?? null,
    weightLabel: value?.quantityMicros ? `${formatWeightMicros(value.quantityMicros)} kg` : 'A pesar',
    incomplete: !value || !!value.boxesIncomplete,
    invalid: false,
  };
}
export function setWeighingExpanded(toggle, panel, expanded) {
  if (!expanded && panel.contains(panel.ownerDocument?.activeElement)) toggle.focus({ preventScroll: true });
  panel.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
}
