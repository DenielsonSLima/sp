import { loadReturnCreateCatalog } from './queries.js';
import { previewReturn } from './services.js';
import { returnRepository as store, totals, money, today, settlementMethods } from './state.js';
import { esc, base, dateLabel, badge } from './common.js';
import { productChoices } from './product-options.js';
import { useLatestPreview } from '../hooks/use-latest-preview.js';
export async function renderCreate(root) {
  const { products, suppliers: supplierList } = await loadReturnCreateCatalog();
  if (!root.isConnected) return;
  const suppliers = supplierList.filter((p) => ['Fornecedor', 'Ambos'].includes(p.type));
  root.innerHTML = `<a class="button secondary" href="${base}">← Voltar às devoluções</a><form class="card return-form"><h2>Nova devolução</h2><p class="subtext">Informe os documentos de referência e os produtos devolvidos.</p><div class="return-fields"><label>Fornecedor<select name="supplierId" required data-searchable="true"><option value="">Selecione o fornecedor</option>${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label>Data da devolução<input type="date" name="date" required value="${today()}"></label><label>Número da nota de origem<input name="originalInvoice" maxlength="100" required placeholder="Ex.: 000123"></label><label>Número da devolução<input name="number" maxlength="100" required placeholder="Ex.: DEV-001"></label><label class="return-wide">Motivo da devolução<textarea name="reason" maxlength="2000" required placeholder="Descreva o motivo e os detalhes necessários"></textarea></label></div><div class="return-toolbar"><h2>Produtos devolvidos</h2><button class="button secondary" type="button" data-add>+ Adicionar produto</button></div><div class="return-items"></div><div class="return-actions"><strong>Total da devolução: <output class="return-total">R$ 0,00</output></strong><div><a class="button secondary" href="${base}">Cancelar</a> <button class="button primary" type="submit" ${!suppliers.length || !products.length ? 'disabled' : ''}>Salvar devolução</button></div></div><p class="return-error" role="alert"></p>${!suppliers.length ? '<p class="subtext">Cadastre um parceiro do tipo Fornecedor ou Ambos em <a href="#cadastros/parceiros">Parceiros</a> para continuar.</p>' : ''}${!products.length ? '<p class="subtext">Cadastre um item em <a href="#cadastros/produtos">Produtos</a> para continuar.</p>' : ''}</form>`;
  const form = root.querySelector('form'),
    items = root.querySelector('.return-items');
  let counter = 0;
  let saving = false;
  const preview = useLatestPreview({
    run: previewReturn,
    isCurrent: () => form.isConnected,
    onResult: (result) => {
      [...items.querySelectorAll('.return-item')].forEach((row, index) =>
        (row.querySelector('output').textContent = money(result.items[index].totalCents)));
      root.querySelector('.return-total').textContent = money(result.total);
    },
    onError: () => {
      root.querySelector('.return-total').textContent = 'A conferir';
      items.querySelectorAll('.return-item').forEach((row) =>
        (row.querySelector('output').textContent = 'Preencha quantidade e valor'));
    },
  });
  const recalc = () => preview.schedule({
    items: [...items.querySelectorAll('.return-item')].map((row) => ({
      quantity: row.querySelector('[data-qty]').value,
      unitValue: row.querySelector('[data-price]').value,
    })),
  });
  const add = () => {
    const index = ++counter;
    const row = document.createElement('div');
    row.className = 'return-item';
    row.innerHTML = `<div><label>Buscar produto<input type="search" data-product-search placeholder="Digite o nome do produto" aria-label="Buscar produto ${index}"></label><label>Produto ${index}<select data-product required aria-label="Produto ${index}"><option value="">Selecione um produto</option></select></label><small data-product-count></small></div><label>Quantidade<input data-qty inputmode="decimal" value="1" required aria-label="Quantidade do produto ${index}"></label><label>Valor unitário (R$)<input data-price inputmode="decimal" required placeholder="0,00" aria-label="Valor unitário do produto ${index}"></label><button class="button secondary" type="button" aria-label="Remover produto ${index}">Remover</button><div class="return-line-total">Total do item: <output>Preencha quantidade e valor</output></div>`;
    items.append(row);
    const select = row.querySelector('[data-product]');
    const updateChoices = () => {
      const selected = select.value;
      const { visible, total } = productChoices(products, row.querySelector('[data-product-search]').value, selected);
      select.innerHTML = '<option value="">Selecione um produto</option>' + visible.map((p) =>
        `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.unit)})</option>`).join('');
      select.value = selected;
      row.querySelector('[data-product-count]').textContent = total > 30 ? `${total} produtos · refine a busca para ver outros` : `${total} produto(s)`;
    };
    row.querySelector('[data-product-search]').oninput = updateChoices;
    updateChoices();
    row.oninput = (event) => {
      if (event.target.matches('[data-qty],[data-price]')) recalc();
    };
    row.querySelector('button').onclick = () => {
      row.remove();
      recalc();
      root.querySelector('[data-add]').focus();
    };
    recalc();
  };
  root.querySelector('[data-add]').onclick = add;
  add();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Salvando…';
    const error = root.querySelector('.return-error');
    error.textContent = '';
    try {
      const input = Object.fromEntries(new FormData(form));
      input.items = [...items.children].map((row) => ({
        productId: row.querySelector('[data-product]').value,
        quantity: row.querySelector('[data-qty]').value,
        unitValue: row.querySelector('[data-price]').value,
      }));
      const record = await store.create(input, { partners: supplierList, products });
      location.hash = `${base}/${record.id}`;
    } catch (e) {
      saving = false;
      if (submit.isConnected) {
        error.textContent = e.message;
        submit.disabled = false;
        submit.textContent = 'Salvar devolução';
      }
    }
  };
}
