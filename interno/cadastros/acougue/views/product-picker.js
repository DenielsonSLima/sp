import { esc } from '../presentation.js';
import { photoMarkup } from '../../produtos/view.js';
import { butcherSubcategories, filterButcherProducts } from '../product-filters.js';

export function bindProductPicker(host, { products, selected, onAdd, onDraw = () => {} }) {
  host.innerHTML = `<div class="butcher-toolbar"><a href="#cadastros/produtos?category=A%C3%87OUGUE">Abrir cadastro de produtos →</a></div>
    <p class="butcher-help">Produtos da categoria Açougue.</p>
    <div class="butcher-fields"><label>Buscar produto<input type="search" class="part-search" placeholder="Picanha, coxão mole, mocotó…"></label>
    <label>Subcategoria<select class="part-subcategory" data-searchable="true"><option value="">Todas as subcategorias</option></select></label>
    <label>Unidade<select class="part-unit"><option value="">KG e UND</option><option value="KG">KG — peso</option><option value="UN">UND — quantidade</option></select></label></div>
    <p class="picker-save-status" role="status" aria-live="polite"></p>
    <div class="butcher-product-options" aria-label="Produtos do açougue disponíveis"></div>`;
  let pending = false;
  const subcategory = host.querySelector('.part-subcategory');
  const list = () => {
    const options = butcherSubcategories(products()), previous = subcategory.value;
    const markup = '<option value="">Todas as subcategorias</option>' + options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    if (subcategory.innerHTML !== markup) {
      subcategory.innerHTML = markup;
      subcategory.value = options.some((o) => o.value === previous) ? previous : '';
    }
    const chosen = new Set(selected().map((p) => p.productId));
    const found = filterButcherProducts(products(), {
      query: host.querySelector('.part-search').value,
      unit: host.querySelector('.part-unit').value,
      subcategory: subcategory.value,
    });
    host.querySelector('.butcher-product-options').innerHTML = found.map((p) => `<button type="button" class="butcher-product-option" data-id="${esc(p.id)}" ${pending || chosen.has(p.id) ? 'disabled' : ''}>
      <span class="butcher-product-photo" data-model-photo="${esc(p.id)}">${photoMarkup(p.photo, p.name)}</span>
      <span class="butcher-product-option-text"><strong>${esc(p.name)}</strong><small>${esc(p.subcategory || 'Sem subcategoria')} · ${p.unit === 'KG' ? 'KG' : 'UND'}</small></span>
      <span class="butcher-product-option-action">${chosen.has(p.id) ? 'Adicionado' : '+ Adicionar'}</span></button>`).join('') || '<p class="butcher-help">Nenhum produto do Açougue encontrado com esses filtros.</p>';
    host.querySelectorAll('[data-id]').forEach((button) => { button.onclick = async () => {
      const p = found.find((item) => item.id === button.dataset.id);
      if (!p || pending) return;
      pending = true;
      const status = host.querySelector('.picker-save-status');
      status.textContent = 'Salvando produto…';
      list();
      try {
      const saved = await onAdd({ productId: p.id, name: p.name, unit: p.unit === 'KG' ? 'KG' : 'UN', percent: '', quantityPerAnimal: '', active: true });
      status.textContent = saved ? 'Produto salvo no modelo. Você pode preencher os valores depois.' : 'Não foi possível salvar o produto. Confira a mensagem na página do modelo e tente novamente.';
      } catch (error) { status.textContent = error.message; }
      finally { pending = false; list(); }
    }; });
    onDraw();
  };
  host.querySelector('.part-search').oninput = list;
  host.querySelector('.part-unit').onchange = list;
  subcategory.onchange = list;
  list();
  return list;
}
