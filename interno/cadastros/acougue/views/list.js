import { heading } from '../../../../shared/ui.js';
import { bindFormDialog } from '../../../../shared/form-dialog.js';
import { listModels, saveModel, percent } from '../state.js';
import { watchButcherModels } from '../realtime.js';
import { chrome, esc, species, modelHref, modelSpeciesLabel } from '../presentation.js';
export function renderList(root) {
  root.innerHTML = `${chrome()}
    <div class="page-heading-actions">${heading('CADASTROS', 'Açougue')}
      <div class="butcher-actions"><a class="button secondary" href="#acougue">Abrir recebimentos →</a>
      <button class="button primary new-model" type="button">Adicionar modelo</button></div></div>
    <p class="butcher-help">Modelos de composição por espécie animal. Cadastre o modelo e depois selecione os produtos de um animal.</p>
    <section class="card butcher-filters"><label>Buscar modelo ou espécie<input type="search" class="model-search" placeholder="Nome, bovino, suíno…"></label>
      <label>Situação<select class="model-filter"><option value="">Todos</option><option value="current">Atuais</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label></section>
    <p class="butcher-status" role="status" aria-live="polite"></p>
    <section class="butcher-parts-grid" aria-label="Modelos cadastrados"></section>
    <form class="card butcher-part-form" hidden><h2>Novo modelo padrão</h2>
      <div class="butcher-fields"><label>Nome do modelo<input name="name" required maxlength="80" placeholder="Ex.: Padrão de desossa"></label>
      <label>Espécie animal<select name="species" required><option value="">Selecione</option>${species.map(([id,label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select></label></div>
      <p class="butcher-help">Após salvar, você poderá adicionar os produtos, os percentuais em KG e as quantidades em UND por animal.</p>
      <div class="butcher-actions"><button type="submit" class="button primary">Salvar e adicionar produtos</button><button type="button" class="button secondary cancel-model">Cancelar</button></div></form>`;
  const form = root.querySelector('form'), status = root.querySelector('[role=status]');
  const modal = bindFormDialog(form, { host: root, resource: 'butcher_models', cancelSelector: '.cancel-model', errorSource: status, wide: true });
  root.querySelector('.new-model').onclick = () => { form.reset(); status.textContent = ''; modal.open(); };
  root.querySelector('.cancel-model').onclick = () => modal.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const saved = await saveModel({ ...Object.fromEntries(new FormData(form)), parts: [] });
      if (!form.isConnected) return;
      modal.close();
      location.hash = modelHref(saved.id);
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  };
  const list = () => {
    const query = root.querySelector('.model-search').value.toLocaleLowerCase('pt-BR');
    const filter = root.querySelector('.model-filter').value;
    const rows = listModels().filter((m) => `${m.name} ${modelSpeciesLabel(m)}`.toLocaleLowerCase('pt-BR').includes(query)
      && (!filter || (filter === 'current' ? m.current : filter === 'active' ? m.active : !m.active)));
    root.querySelector('.butcher-parts-grid').innerHTML = rows.length ? rows.map((m) => `
      <article class="card butcher-part-card ${m.active ? '' : 'is-inactive'}">
        <div class="butcher-model-tags"><span class="butcher-part-badge">${m.active ? 'Ativo' : 'Inativo'}</span>
        ${m.current ? '<span class="butcher-current-badge">Atual</span>' : ''}<span>v${m.version}</span></div>
        <h2>${esc(m.name)}</h2><p>${esc(modelSpeciesLabel(m))}</p>
        <div class="butcher-part-rate">${percent(m.totalBps)}%<small>do peso recebido em KG</small></div>
        <p>${m.parts.length} produto(s) na composição${m.schemaVersion === 2 ? ' · base: 1 animal' : ' · modelo anterior'}</p>
        <a class="button secondary" href="${modelHref(m.id)}">Abrir composição →</a>
      </article>`).join('') : '<div class="card butcher-empty"><h2>Nenhum modelo encontrado</h2><p>Adicione um modelo para configurar a composição de um animal.</p></div>';
  };
  root.querySelector('.model-search').oninput = list;
  root.querySelector('.model-filter').onchange = list;
  list();
  watchButcherModels(root.querySelector('.butcher-parts-grid'), list);
}
