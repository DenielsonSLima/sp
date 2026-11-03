import { useProductPreviews } from './hooks/use-product-previews.js';
import { normalizeSearch } from '../../shared/filters.js';
import { isPhotoData } from '../cadastros/produtos/photo.js';
import { esc } from './common.js';
export const eligibleProducts = (products) => products.filter((p) => normalizeSearch(p.category) === 'hortifruti');
export function openProductPicker(host, products, existingIds, onSave, trigger, { loadPreviews } = {}) {
  if (host.querySelector('.hf-picker')) return;
  const available = eligibleProducts(products),
    selected = new Set(),
    dialog = document.createElement('dialog');
  dialog.className = 'hf-picker';
  dialog.setAttribute('aria-labelledby', 'hf-picker-title');
  dialog.innerHTML = `<h2 id="hf-picker-title">Adicionar produtos</h2><p class="hf-help">Somente categoria Hortifruti. Peso e custos podem ser informados depois.</p><label>Buscar produto<input type="search" placeholder="Nome do produto"></label><div class="hf-picker-list"></div><p class="hf-error" role="alert"></p><div class="hf-actions"><button class="button secondary" data-close type="button">Cancelar</button><button class="button primary" data-save type="button">Salvar produtos selecionados</button></div>`;
  host.append(dialog);
  const previews = loadPreviews
    ? useProductPreviews(dialog, {
        loadPreviews,
        onPreview: (product) => {
          const target = [...dialog.querySelectorAll('[data-product-id]')].find(
            (row) => row.dataset.productId === product.id,
          );
          if (!target || !product.photo || !isPhotoData(product.photo)) return;
          const img = document.createElement('img');
          img.src = product.photo;
          img.alt = '';
          target.querySelector('img,.hf-photo-placeholder')?.replaceWith(img);
        },
        onError: (error) => {
          dialog.querySelector('.hf-error').textContent = error.message;
        },
      })
    : null;
  const draw = () => {
    const needle = normalizeSearch(dialog.querySelector('input').value),
      rows = available.filter((p) => normalizeSearch(p.name).includes(needle));
    dialog.querySelector('.hf-picker-list').innerHTML = rows.length
      ? rows
          .map(
            (p) =>
              `<label class="hf-pick-product" data-product-id="${esc(p.id)}"><input type="checkbox" value="${esc(p.id)}" ${existingIds.includes(p.id) ? 'checked disabled' : selected.has(p.id) ? 'checked' : ''}>${p.photo && isPhotoData(p.photo) ? `<img src="${esc(p.photo)}" alt="">` : '<span class="hf-photo-placeholder">Sem foto</span>'}<span>${esc(p.name)}<small>${existingIds.includes(p.id) ? 'Já adicionado' : esc(p.unit)}</small></span></label>`,
          )
          .join('')
      : '<p class="hf-help">Nenhum produto de Hortifruti encontrado. Confira a categoria em Cadastros → Produtos.</p>';
    dialog
      .querySelectorAll('[type=checkbox]:not(:disabled)')
      .forEach((el) => (el.onchange = () => (el.checked ? selected.add(el.value) : selected.delete(el.value))));
    previews?.observe([...dialog.querySelectorAll('[data-product-id]')], available);
  };
  const close = () => {
    previews?.dispose();
    dialog.close();
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  };
  dialog.querySelector('[data-close]').onclick = close;
  dialog.oncancel = (event) => {
    event.preventDefault();
    close();
  };
  dialog.querySelector('[type=search]').oninput = draw;
  dialog.querySelector('[data-save]').onclick = async () => {
    try {
      await onSave([...selected]);
      close();
    } catch (e) {
      dialog.querySelector('.hf-error').textContent = e.message;
    }
  };
  draw();
  dialog.showModal();
}
