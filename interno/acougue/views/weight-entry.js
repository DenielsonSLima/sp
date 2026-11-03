import { state } from '../state.js';
import { esc } from '../common.js';
import { attachWeightInput } from '../../../shared/components/weight-input.js';

export const weightEntryMarkup = ({ allowParts = true } = {}) => `<div class="butcher-fields">
  <label>Informar peso por<select name="weightMode">
    <option value="total" ${state.draft.weightMode === 'total' ? 'selected' : ''}>Peso total do lote</option>
    ${allowParts ? `<option value="parts" ${state.draft.weightMode === 'parts' ? 'selected' : ''}>Dianteiros e traseiros</option>` : ''}
    <option value="individual" ${state.draft.weightMode === 'individual' ? 'selected' : ''}>Peso por animal</option>
  </select></label>
  <label class="lot-total-field">Peso total recebido para desossa (kg)<input name="weight" inputmode="decimal" value="${esc(state.draft.weight)}" placeholder="0,00"></label>
</div>
<section class="butcher-section-entry" hidden>
  <div class="butcher-toolbar"><div><h3>Partes recebidas</h3><p class="butcher-help">Informe os quatro quartos de cada animal: dianteiro esquerdo e direito, traseiro esquerdo e direito. Use o peso total de cada linha; a quantidade não multiplica esse peso.</p></div>
    <div class="butcher-actions"><button class="button secondary add-section" data-type="forequarter" type="button">Adicionar dianteiro</button><button class="button secondary add-section" data-type="hindquarter" type="button">Adicionar traseiro</button></div>
  </div><div class="butcher-section-rows"></div>
  <p class="butcher-help butcher-sections-empty">Adicione os dianteiros e traseiros recebidos e selecione o lado de cada um.</p>
</section>
<section class="butcher-animal-entry" hidden><div class="butcher-toolbar"><h3>Animais do lote</h3><button class="button secondary add-animal" type="button">Adicionar animal</button></div><div class="butcher-animal-rows"></div></section>`;

export function bindWeightEntry(form, { onChange }) {
  const animalHost = form.querySelector('.butcher-animal-rows');
  const sectionHost = form.querySelector('.butcher-section-rows');
  const capture = () => {
    state.draft.weight = form.elements.weight.value;
    state.draft.weightMode = form.elements.weightMode.value;
    state.draft.animals = [...animalHost.querySelectorAll('.butcher-animal-row')].map((row) => ({
      identification: row.querySelector('[data-animal-id]').value,
      weight: row.querySelector('[data-animal-weight]').value,
    }));
    state.draft.sections = [...sectionHost.querySelectorAll('.butcher-section-row')].map((row) => ({
      type: row.dataset.type,
      side: row.querySelector('[data-section-side]').value,
      quantity: row.querySelector('[data-section-quantity]').value,
      weight: row.querySelector('[data-section-weight]').value,
    }));
  };
  const notify = () => { capture(); onChange(); };
  const renderAnimals = () => {
    animalHost.innerHTML = state.draft.animals.map((animal, index) => `<div class="butcher-animal-row">
      <span>Animal ${index + 1}</span><label>Identificação (opcional)<input data-animal-id maxlength="80" value="${esc(animal.identification)}" placeholder="Ex.: Brinco ou referência"></label>
      <label>Peso recebido para desossa (kg)<input data-animal-weight inputmode="decimal" value="${esc(animal.weight)}" placeholder="0,00"></label>
      <button class="button secondary remove-animal" data-index="${index}" type="button" aria-label="Remover animal ${index + 1}" ${state.draft.animals.length === 1 ? 'disabled' : ''}>Remover</button></div>`).join('');
    animalHost.querySelectorAll('[data-animal-weight]').forEach(attachWeightInput);
    animalHost.querySelectorAll('.remove-animal').forEach((button) => {
      button.onclick = () => {
        capture();
        state.draft.animals.splice(Number(button.dataset.index), 1);
        state.draft.animalCount = String(state.draft.animals.length);
        renderAnimals(); applyMode(); onChange();
        form.querySelector('.add-animal').focus();
      };
    });
  };
  const renderSections = () => {
    sectionHost.innerHTML = state.draft.sections.map((section, index) => {
      const name = section.type === 'forequarter' ? 'Dianteiro' : 'Traseiro';
      return `<div class="butcher-section-row" data-type="${esc(section.type)}">
        <strong>${name}</strong><label>Lado<select data-section-side aria-label="Lado do ${name.toLowerCase()} ${index + 1}"><option value="left" ${section.side === 'left' ? 'selected' : ''}>Esquerdo</option><option value="right" ${section.side === 'right' ? 'selected' : ''}>Direito</option></select></label>
        <label>Quantidade<input data-section-quantity type="number" min="1" max="1000" step="1" value="${esc(section.quantity)}" required></label>
        <label>Peso total da linha (kg)<input data-section-weight inputmode="decimal" value="${esc(section.weight)}" placeholder="0,00" required></label>
        <button class="button secondary remove-section" data-index="${index}" type="button" aria-label="Remover ${name.toLowerCase()} ${index + 1}">Remover</button></div>`;
    }).join('');
    form.querySelector('.butcher-sections-empty').hidden = state.draft.sections.length > 0;
    sectionHost.querySelectorAll('[data-section-weight]').forEach(attachWeightInput);
    sectionHost.querySelectorAll('.remove-section').forEach((button) => {
      button.onclick = () => {
        capture(); state.draft.sections.splice(Number(button.dataset.index), 1);
        renderSections(); applyMode(); onChange();
        form.querySelector('.add-section').focus();
      };
    });
  };
  const applyMode = () => {
    const individual = form.elements.weightMode.value === 'individual';
    const parts = form.elements.weightMode.value === 'parts';
    form.querySelector('.lot-total-field').hidden = individual || parts;
    form.elements.weight.disabled = individual || parts;
    form.elements.weight.required = !individual && !parts;
    form.querySelector('.butcher-animal-entry').hidden = !individual;
    form.querySelector('.butcher-section-entry').hidden = !parts;
    animalHost.querySelectorAll('input').forEach((input) => {
      input.disabled = !individual;
      input.required = individual && input.hasAttribute('data-animal-weight');
    });
    sectionHost.querySelectorAll('input,select').forEach((input) => { input.disabled = !parts; });
  };
  const expandAnimals = () => {
    const raw = state.draft.animalCount, n = Number(raw);
    if (/^\d+$/.test(raw) && n >= 1 && n <= 1000 && state.draft.weightMode === 'individual') {
      while (state.draft.animals.length < n) state.draft.animals.push({ identification: '', weight: '' });
      renderAnimals();
    }
    applyMode();
  };
  form.querySelectorAll('.add-section').forEach((button) => {
    button.onclick = () => {
      capture();
      if (state.draft.sections.length >= 1000) return;
      const type = button.dataset.type;
      const side = state.draft.sections.some((section) => section.type === type && section.side === 'left') ? 'right' : 'left';
      state.draft.sections.push({ type, side, quantity: '1', weight: '' });
      renderSections(); applyMode(); onChange();
      sectionHost.lastElementChild.querySelector('[data-section-weight]').focus();
    };
  });
  form.querySelector('.add-animal').onclick = () => {
    capture();
    if (state.draft.animals.length >= 1000) return;
    state.draft.animals.push({ identification: '', weight: '' });
    state.draft.animalCount = String(state.draft.animals.length);
    renderAnimals(); applyMode(); onChange();
    animalHost.lastElementChild.querySelector('[data-animal-weight]').focus();
  };
  form.elements.weightMode.onchange = () => { capture(); expandAnimals(); notify(); };
  renderAnimals(); renderSections(); expandAnimals();
  attachWeightInput(form.elements.weight);
  return { capture, applyMode };
}
