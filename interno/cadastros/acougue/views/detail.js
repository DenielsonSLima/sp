import { photoMarkup } from '../../produtos/view.js';
import { useModelPhotos } from '../hooks/use-model-photos.js';
import { heading } from '../../../../shared/ui.js';
import { listModels, loadButcherModels, setCurrent, toggleModel, saveModel, percent } from '../state.js';
import { loadModelProducts } from '../queries.js';
import { watchModelEditor } from '../realtime.js';
import { esc, modelHref, partInput, modelSpeciesLabel } from '../presentation.js';
import { useModelEditor } from '../hooks/use-model-editor.js';
import { bindProductDialog } from './product-dialog.js';
import { bindModelNameDialog } from './name-dialog.js';
import { bindModelWeighing, weighingMarkup, weightInput, attachWeightInput, weightDecimal } from './weighing.js';
export async function renderDetail(root, model) {
  let products = await loadModelProducts();
  if (!root.isConnected) return;
  const editor = useModelEditor(model), legacy = model.schemaVersion !== 2;
  root.innerHTML = `    <nav class="butcher-breadcrumb" aria-label="Caminho de navegação"><a href="${modelHref()}">Açougue</a><span aria-hidden="true">/</span><span>${esc(model.name)}</span></nav>
    <div class="page-heading-actions">${heading('COMPOSIÇÃO POR ANIMAL', model.name)}<div class="butcher-actions">${legacy ? '' : '<button class="button primary select-products" type="button">Selecionar produtos</button><button class="button secondary edit-model" type="button">Editar</button>'}<a class="button secondary" href="${modelHref()}">← Voltar para modelos</a></div></div>
    <section class="card butcher-model-overview"><div><span>Espécie animal</span><strong>${esc(modelSpeciesLabel(model))}</strong></div><div><span>Base do modelo</span><strong>1 animal</strong></div><div><span>Rendimento salvo em KG</span><strong class="saved-yield">${percent(model.totalBps)}%</strong></div></section>
    <p class="butcher-help">Percentuais calculados sobre o peso recebido para desossa, sem conversão de peso vivo. Produtos em UND usam quantidade por animal e não entram na soma dos percentuais. Registre somente as partes que acompanham esse recebimento.</p>
    <p class="butcher-status" role="status" aria-live="polite"></p>
    ${legacy ? '<p class="card butcher-part-form">Este modelo usa a distribuição anterior. Seu histórico foi preservado. Crie um novo modelo por espécie animal para vincular produtos e quantidades por animal.</p>' : `
    <form class="card butcher-composition-form">
      <div class="butcher-toolbar"><h2>Produtos de 1 animal</h2><span class="butcher-part-badge">KG + UND</span></div>
      ${weighingMarkup()}
      <div class="butcher-composition-content">
        <div class="butcher-editor-parts" id="composition-panel" role="tabpanel"></div><p class="butcher-help">As partes são salvas ao adicionar. Você pode preencher os rendimentos, pesos e quantidades depois e salvar a composição.</p>
        <div class="butcher-actions"><button class="button primary" type="submit">Salvar composição</button><button class="button secondary discard-changes" type="button">Descartar alterações</button></div>
      </div>
      <section class="butcher-costs-panel" id="model-costs-panel" role="tabpanel" aria-labelledby="composition-costs-tab" tabindex="0" hidden>
        <h3>Custos</h3><p class="butcher-help">A configuração de custos será desenvolvida em uma próxima etapa.</p>
      </section></form>`}
    <section class="card butcher-model-controls"><p class="model-state"></p><div class="butcher-actions"><button class="button secondary current-model" type="button">Definir como atual</button><button class="button secondary toggle-model" type="button"></button></div></section>
    <dialog class="butcher-confirm"><h2>Inativar modelo atual?</h2><p>Esta espécie animal ficarão sem modelo atual para novos recebimentos. Os recebimentos anteriores serão preservados.</p><div class="butcher-actions"><button type="button" class="button secondary cancel-inactivate">Cancelar</button><button type="button" class="button primary confirm-inactivate">Inativar modelo</button></div></dialog>`;
  const status = root.querySelector('[role=status]'), dialog = root.querySelector('dialog');
  const form = root.querySelector('.butcher-composition-form');
  let busy = false, refreshPicker = () => {}, weighing;
  const photos = useModelPhotos(root.querySelector('.butcher-model-overview').parentElement, {
    products: () => products,
    onError: (error) => { status.textContent = 'Não foi possível carregar algumas fotos. ' + error.message; },
  });
  const controls = () => {
    root.querySelector('.model-state').textContent = `Versão ${model.version} · ${model.active ? 'Ativo' : 'Inativo'}${model.current ? ' · Atual para ' + modelSpeciesLabel(model) : model.ready === false ? ' · Em elaboração' : ''}`;
    root.querySelector('.toggle-model').textContent = model.active ? 'Inativar modelo' : 'Ativar modelo';
    root.querySelector('.current-model').disabled = busy || editor.dirty || model.current || !model.active || model.ready === false;
    root.querySelector('.toggle-model').disabled = busy || editor.dirty;
    if (form) {
      root.querySelector('.edit-model').disabled = busy;
      root.querySelector('.select-products').disabled = busy;
      form.querySelector('[type=submit]').disabled = busy;
      form.querySelector('.discard-changes').disabled = busy || !editor.dirty;
      weighing?.refresh();
    }
  };
  const changed = () => {
    status.textContent = 'Alterações não salvas. Salve a composição antes de definir o modelo como atual.';
    controls();
  };
  const renderParts = () => {
    if (!form) return;
    const host = form.querySelector('.butcher-editor-parts');
    host.innerHTML = editor.draft.parts.length ? editor.draft.parts.map((part, i) => `
      <div class="butcher-editor-row butcher-product-row" data-index="${i}">
        <div class="butcher-part-identity"><span class="butcher-product-photo" data-model-photo="${esc(part.productId || '')}">${photoMarkup(products.find((p) => p.id === part.productId)?.photo, part.name)}</span><div class="butcher-part-name"><strong>${esc(part.name)}</strong><span>${part.unit === 'KG' ? 'KG — rendimento sobre o peso' : 'UND — quantidade por animal'}</span></div></div>
        ${part.unit === 'KG' ? (editor.draft.compositionMode === 'weight' ? weightInput(part, i) : `<label>Rendimento (%)<input data-field="percent" inputmode="decimal" placeholder="Ex.: 2,50" value="${esc(part.percent)}"></label>`) : `<label>UND por animal<input data-field="quantityPerAnimal" inputmode="numeric" placeholder="Ex.: 4" value="${esc(part.quantityPerAnimal)}"></label>`}
        <label class="butcher-part-active"><input data-field="active" type="checkbox" ${part.active ? 'checked' : ''}> Incluir no modelo</label>
        <button type="button" class="button secondary remove-part" aria-label="Remover ${esc(part.name)}">Remover</button></div>`).join('') : '<div class="butcher-empty"><h2>Adicione os produtos deste animal</h2><p>Use o botão Selecionar produtos no topo para escolher os cortes e as partes.</p></div>';
    photos.observe();
    host.querySelectorAll('[data-field]').forEach((input) => {
      if (input.dataset.field === 'weight') attachWeightInput(input);
      input.oninput = () => {
      const parts = structuredClone(editor.draft.parts);
      parts[Number(input.closest('[data-index]').dataset.index)][input.dataset.field] = input.type === 'checkbox'
        ? input.checked : input.dataset.field === 'weight' ? weightDecimal(input.value) : input.value;
      editor.change({ parts }); changed();
      if (input.dataset.field === 'weight' || input.dataset.field === 'active') weighing?.schedule();
    }; });
    host.querySelectorAll('.remove-part').forEach((button) => { button.onclick = () => {
      const index = Number(button.closest('[data-index]').dataset.index);
      editor.change({ parts: editor.draft.parts.filter((_, i) => i !== index) });
      renderParts(); refreshPicker(); changed(); weighing?.schedule();
    }; });
  };
  const run = async (action, { preserveParts = false } = {}) => {
    if (busy) return false;
    const pendingParts = preserveParts && editor.dirty ? structuredClone({ parts: editor.draft.parts,
      compositionMode: editor.draft.compositionMode, weighingTotal: editor.draft.weighingTotal }) : null;
    busy = true; controls();
    // Freeze editable values while the reviewed snapshot is being sent.
    root.querySelectorAll('input, .remove-part, .butcher-product-option').forEach((el) => { el.disabled = true; });
    try {
      const saved = await action();
      if (!status.isConnected) return;
      model = saved; editor.reset(saved);
      if (pendingParts) editor.change(pendingParts);
      weighing?.reset();
      root.querySelector('h1').textContent = saved.name;
      root.querySelector('.butcher-breadcrumb span:last-child').textContent = saved.name;
      root.querySelector('.saved-yield').textContent = `${percent(saved.totalBps)}%`;
      status.textContent = preserveParts
        ? `Nome atualizado.${pendingParts ? ' As alterações da composição ainda precisam ser salvas.' : ''}`
        : saved.ready === false ? 'Partes salvas. Preencha os valores depois para usar o modelo nos recebimentos.'
        : 'Modelo salvo. A composição será usada nos próximos recebimentos quando este modelo estiver definido como atual.';
      renderParts();
      return true;
    } catch (error) {
      if (status.isConnected) status.textContent = error.message;
      return false;
    }
    finally {
      busy = false;
      if (status.isConnected) {
        root.querySelectorAll('input, .remove-part').forEach((el) => { el.disabled = false; });
        refreshPicker(); controls();
      }
    }
  };
  if (form) {
    renderParts();
    weighing = bindModelWeighing(form, { editor, onChange: changed, renderParts, isBusy: () => busy });
    bindModelNameDialog(root, {
      getName: () => editor.draft.name,
      status,
      onSave: (name) => run(() => saveModel({
        ...model,
        _version: editor.draft._version,
        name,
        parts: model.parts.map(partInput),
      }), { preserveParts: true }),
    });
    form.onsubmit = (event) => { event.preventDefault(); void run(async () => {
      if (!await weighing.flush()) throw Error('A tela ou a sessão mudou. Reabra o modelo antes de salvar.');
      return editor.save();
    }); };
    form.querySelector('.discard-changes').onclick = () => {
      editor.reset(model); weighing.reset(); renderParts(); refreshPicker(); controls(); status.textContent = 'Alterações descartadas.';
    };
    refreshPicker = bindProductDialog(root, {
      products: () => products, onDraw: () => photos.observe(), selected: () => editor.draft.parts,
      onAdd: async (part) => {
        if (busy) return false;
        const previous = structuredClone(editor.draft.parts);
        editor.change({ parts: [...previous, part] });
        renderParts();
        const saved = await run(() => editor.save());
        if (!saved && status.isConnected) {
          editor.change({ parts: previous }); renderParts(); controls();
        }
        return saved;
      },
    });
  }
  root.querySelector('.current-model').onclick = () => void run(() => setCurrent(model.id, model._version));
  root.querySelector('.toggle-model').onclick = () => {
    if (model.current && model.active) dialog.showModal();
    else void run(() => toggleModel(model.id, { expectedVersion: model._version }));
  };
  dialog.querySelector('.cancel-inactivate').onclick = () => dialog.close();
  dialog.querySelector('.confirm-inactivate').onclick = () => {
    dialog.close(); void run(() => toggleModel(model.id, { confirmCurrent: true, expectedVersion: model._version }));
  };
  controls();
  if (editor.dirty) changed();
  watchModelEditor(status, async () => {
    await loadButcherModels();
    const latest = listModels().find((m) => m.id === model.id);
    products = await loadModelProducts();
    if (!status.isConnected || busy) return;
    refreshPicker();
    if (latest && latest._version !== model._version) {
      // Do not replace the version of a draft that the user actually reviewed.
      status.textContent = 'Este modelo mudou em outra sessão. Reabra o modelo e descarte o rascunho para carregar a nova versão.';
    }
  });
}
