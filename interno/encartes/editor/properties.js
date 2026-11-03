import { getDataContext } from '../../../shared/data/api.js';
import { escapeHtml } from '../../../shared/ui.js';
import { units, loadUnits } from '../../cadastros/unidades/state.js';
import { readPhoto, materializeProductPhoto } from '../../cadastros/produtos/photo.js';
import { duplicateElement, FONT_FAMILIES } from '../model.js';
import { replaceDesignProduct } from '../product-replacement.js';
import { syncProductTexts, updateLinkedProductText } from '../layered-templates.js';
import { createLayerPngBlob, downloadBlob } from '../export.js';
import { safeName } from './presentation.js';
import { offerTextInput, readOfferText } from './offer-fields.js';
import { bindOfferPriceInput } from './price-input.js';
import { legacyBadgeParts, upgradePriceBadge } from '../price-badge.js';
import { priceBadgeControls, applyPriceBadgeControls } from './price-badge-controls.js';
export function createPropertiesRenderer({
  root,
  state: S,
  selected,
  mutate,
  update,
  message,
  ensureCatalog,
  loadCatalogPhoto,
  getRevision,
  isCurrent,
  renderPanel,
  catalog,
}) {
  let productDataReady = false;
  const applyProps = (form) => {
    const el = selected();
    if (!el || el.locked) return;
    const data = Object.fromEntries(new FormData(form));
    mutate(
      (d) => {
        const item = d.elements.find((e) => e.id === el.id);
        for (const key of ['x', 'y', 'width', 'height', 'rotation'])
          if (data[key] !== undefined) item[key] = Number(data[key]);
        item.opacity = Number(data.opacity) / 100;
        item.label = data.label;
        if (item.type === 'text' && item.priceBadge) {
          item.text = readOfferText(item, data.text);
          applyPriceBadgeControls(item, data, form);
        }
        if (item.type === 'text' && !item.priceBadge) {
          item.strokeColor = data.strokeColor;
          item.strokeWidth = Number(data.strokeWidth);
          item.shadow = form.elements.shadow.checked;
          item.autoFit = form.elements.autoFit.checked;
          item.text = readOfferText(item, data.text);
          item.fontFamily = data.fontFamily;
          item.fontSize = Number(data.fontSize);
          item.fontWeight = Number(data.fontWeight);
          item.align = data.align;
          item.color = data.color;
          updateLinkedProductText(d, item);
        }
        if (item.type === 'product') {
          item.placeholder = false;
          item.name = data.name;
          item.unit = data.unit;
          item.fontFamily = data.fontFamily;
          item.background = data.background;
          item.textColor = data.textColor;
          item.priceColor = data.priceColor;
          item.layout = data.layout;
          item.transparent = form.elements.transparent.checked;
          const raw = String(data.price || '').trim();
          if (raw.length > 40) throw new Error('Use até 40 caracteres no texto de preço.');
          item.priceText = raw ? (raw.startsWith('R$') ? raw : `R$ ${raw}`) : '';
          delete item.priceCents;
        }
        if (item.type === 'image') item.fit = data.fit;
        if (item.type === 'product') syncProductTexts(d, item);
        if (item.type === 'shape') {
          item.fill = data.fill;
          item.shapeKind = data.shapeKind;
          item.radius = Number(data.radius);
        }
      },
      { panel: false },
    );
  };
  const renderProperties = () => {
    const pane = root.querySelector('.flyer-properties-panel');
    if (!pane) return;
    const el = selected();
    if (el?.type === 'product' && !productDataReady) {
      pane.innerHTML = '<h2>Propriedades do produto</h2><p class="flyer-help">Carregando catálogo…</p>';
      void Promise.all([ensureCatalog(), loadUnits()])
        .then(() => {
          productDataReady = true;
          if (isCurrent() && selected()?.id === el.id) renderPanel();
        })
        .catch((error) => message(error.message, true));
      return;
    }
    if (!el) {
      pane.innerHTML =
        '<h2>Propriedades</h2><div class="studio-properties-empty"><span aria-hidden="true">↖</span><strong>Selecione um elemento</strong><p>Clique na arte ou em uma camada para ajustar texto, aparência e posição.</p></div>';
      return;
    }
    const fontOptions = (value) =>
      FONT_FAMILIES.map(
        (f) =>
          `<option ${value === f ? 'selected' : ''} style="font-family:${escapeHtml(f)}">${escapeHtml(f)}</option>`,
      ).join('');
    pane.innerHTML = `<h2>${el.type === 'product' ? 'Oferta do produto' : el.type === 'text' ? (el.offerField === 'price' ? 'Preço da oferta' : el.offerField === 'name' ? 'Descrição do produto' : 'Texto selecionado') : el.type === 'shape' ? 'Faixa de cor' : 'Imagem selecionada'}</h2><p class="flyer-help">${el.locked ? 'Camada bloqueada. Use o cadeado em Camadas para editar.' : el.offerField ? 'Edite este campo da oferta. As alterações valem somente para esta arte.' : 'Arraste na arte para mover e redimensionar.'}</p>${legacyBadgeParts(S.design, el) ? '<button type="button" class="button secondary flyer-upgrade-price">Adaptar preço ao círculo</button><p class="flyer-help">Une o valor e o círculo para ajustar tamanho, cores e borda juntos.</p>' : ''}<form class="flyer-properties"><fieldset ${el.locked ? 'disabled' : ''}><label>Nome da camada<input name="label" maxlength="100" value="${escapeHtml(el.label || '')}" placeholder="Ex.: Título da oferta"></label>${
      el.priceBadge ? priceBadgeControls(el, fontOptions) : el.type === 'text'
        ? `${offerTextInput(el)}<label>Fonte<select name="fontFamily">${fontOptions(el.fontFamily)}</select></label><div class="flyer-two-fields"><label>Tamanho<input name="fontSize" type="number" min="8" max="600" value="${el.fontSize}"></label><label>Peso<select name="fontWeight">${[400, 600, 700, 900].map((n) => `<option value="${n}" ${Number(el.fontWeight) === n ? 'selected' : ''}>${n === 400 ? 'Normal' : n === 600 ? 'Seminegrito' : n === 700 ? 'Negrito' : 'Extra'}</option>`).join('')}</select></label></div><div class="flyer-two-fields"><label>Cor<input type="color" name="color" value="${el.color}"></label><label>Alinhamento<select name="align">${[
            ['left', 'Esquerda'],
            ['center', 'Centro'],
            ['right', 'Direita'],
          ]
            .map(([v, l]) => `<option value="${v}" ${el.align === v ? 'selected' : ''}>${l}</option>`)
            .join(
              '',
            )}</select></label></div><div class="flyer-two-fields"><label>Contorno<input name="strokeWidth" type="number" min="0" max="20" value="${el.strokeWidth || 0}"></label><label>Cor do contorno<input name="strokeColor" type="color" value="${el.strokeColor || '#ffffff'}"></label></div><label class="flyer-check"><input name="shadow" type="checkbox" ${el.shadow ? 'checked' : ''}> Sombra do texto</label><label class="flyer-check"><input name="autoFit" type="checkbox" ${el.autoFit ? 'checked' : ''}> Ajustar texto à caixa</label>`
        : ''
    }${el.type === 'product' ? `<label>Trocar produto<select class="flyer-replace-product"><option value="">Escolher no catálogo…</option>${catalog.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label><label>Apresentação<select name="layout"><option value="card" ${el.layout !== 'photo' ? 'selected' : ''}>Oferta completa</option><option value="photo" ${el.layout === 'photo' ? 'selected' : ''}>Somente a foto recortada</option></select></label><label class="flyer-check"><input name="transparent" type="checkbox" ${el.transparent ? 'checked' : ''}> Fundo transparente</label><label>Nome na arte<input name="name" maxlength="180" value="${escapeHtml(el.name)}"></label><div class="flyer-two-fields"><label>Preço (R$)<input name="price" inputmode="decimal" placeholder="9,99" value="${Number.isInteger(el.priceCents) ? (el.priceCents / 100).toFixed(2).replace('.', ',') : escapeHtml(el.priceText.replace(/^R\$\s*/, ''))}"></label><label>Unidade<input name="unit" maxlength="40" value="${escapeHtml(el.unit)}"></label></div><label>Fonte<select name="fontFamily">${fontOptions(el.fontFamily)}</select></label><div class="flyer-three-colors"><label>Fundo<input type="color" name="background" value="${el.background}"></label><label>Texto<input type="color" name="textColor" value="${el.textColor}"></label><label>Preço<input type="color" name="priceColor" value="${el.priceColor}"></label></div><label>Trocar foto nesta arte<input type="file" class="flyer-replace-photo" accept="image/jpeg,image/png,image/webp"></label>` : ''}${
      el.type === 'shape'
        ? `<label>Cor da forma<input name="fill" type="color" value="${el.fill}"></label><label>Formato<select name="shapeKind">${[
            ['rectangle', 'Retângulo'],
            ['rounded', 'Arredondado'],
            ['ellipse', 'Elipse'],
          ]
            .map(([v, l]) => `<option value="${v}" ${el.shapeKind === v ? 'selected' : ''}>${l}</option>`)
            .join(
              '',
            )}</select></label><label>Arredondamento<input type="number" name="radius" min="0" max="500" value="${el.radius ?? 24}"></label>`
        : ''
    }${el.type === 'image' ? `<label>Encaixe da imagem<select name="fit"><option value="contain" ${el.fit !== 'cover' ? 'selected' : ''}>Mostrar inteira</option><option value="cover" ${el.fit === 'cover' ? 'selected' : ''}>Preencher a área</option></select></label><label>Trocar imagem<input type="file" class="flyer-replace-photo" accept="image/jpeg,image/png,image/webp"></label>` : ''}<details class="studio-properties-geometry"><summary>Posição e tamanho</summary><div class="flyer-two-fields">${[
      ['x', 'Posição X'],
      ['y', 'Posição Y'],
      ['width', 'Largura'],
      ['height', 'Altura'],
    ]
      .map(
        ([key, label]) =>
          `<label>${label}<input name="${key}" type="number" min="${key === 'width' || key === 'height' ? 1 : 0}" max="4096" value="${Math.round(el[key])}"></label>`,
      )
      .join(
        '',
      )}</div><div class="flyer-two-fields"><label>Rotação (°)<input name="rotation" type="number" min="-360" max="360" value="${Math.round(el.rotation || 0)}"></label><label>Opacidade (%)<input name="opacity" type="number" min="0" max="100" value="${Math.round((el.opacity ?? 1) * 100)}"></label></div><p class="flyer-help">Medidas em pixels. Shift mantém a proporção ao redimensionar.</p></details></fieldset></form><div class="flyer-element-transforms"><button type="button" class="button secondary" data-flip="flipX" ${el.locked ? 'disabled' : ''}>Espelhar ↔</button><button type="button" class="button secondary" data-flip="flipY" ${el.locked ? 'disabled' : ''}>Espelhar ↕</button><button type="button" class="button secondary" data-order="front">Trazer à frente</button><button type="button" class="button secondary" data-order="back">Enviar ao fundo</button></div><div class="flyer-nudges" role="group" aria-label="Mover elemento 10 pixels"><button type="button" data-nudge="-10,0" aria-label="Mover para esquerda" ${el.locked ? 'disabled' : ''}>←</button><button type="button" data-nudge="0,-10" aria-label="Mover para cima" ${el.locked ? 'disabled' : ''}>↑</button><button type="button" data-nudge="0,10" aria-label="Mover para baixo" ${el.locked ? 'disabled' : ''}>↓</button><button type="button" data-nudge="10,0" aria-label="Mover para direita" ${el.locked ? 'disabled' : ''}>→</button></div><div class="flyer-element-actions"><button class="button secondary flyer-lock" type="button">${el.locked ? 'Desbloquear' : 'Bloquear'}</button><button class="button secondary flyer-duplicate-element" type="button">Duplicar</button><button class="button secondary flyer-delete-element" type="button">Remover</button><button class="button secondary flyer-hide-element" type="button">${el.hidden ? 'Mostrar' : 'Ocultar'}</button><button class="button secondary flyer-download-layer" type="button">Baixar camada PNG</button></div>`;
    pane.querySelector('.flyer-upgrade-price')?.addEventListener('click', () =>
      mutate(d => upgradePriceBadge(d, el.id)),
    );
    pane.querySelector('.flyer-replace-product')?.addEventListener('change', async (event) => {
      const control = event.currentTarget,
        product = catalog.find((p) => p.id === control.value);
      if (!product) return;
      const companyId = getDataContext()?.companyId,
        designId = S.design.id,
        designRevision = getRevision(),
        elementId = el.id;
      control.disabled = true;
      try {
        const next = await replaceDesignProduct(
          S.design,
          elementId,
          { ...product, unit: units.find((unit) => unit.id === product.unit)?.symbol || product.unit },
          {
            materialize: async () => materializeProductPhoto(await loadCatalogPhoto(product)),
            isCurrent: () =>
              root.isConnected &&
              control.isConnected &&
              companyId === getDataContext()?.companyId &&
              designId === S.design.id &&
              designRevision === getRevision() &&
              S.design.elements.some((item) => item.id === elementId && !item.locked),
          },
        );
        update(next);
      } catch (error) {
        message(error.message, true);
      } finally {
        if (control.isConnected) control.disabled = false;
      }
    });
    pane.querySelectorAll('[data-flip]').forEach(
      (button) =>
        (button.onclick = () =>
          mutate((d) => {
            const item = d.elements.find((e) => e.id === el.id);
            item[button.dataset.flip] = !item[button.dataset.flip];
          })),
    );
    pane.querySelectorAll('[data-order]').forEach(
      (button) =>
        (button.onclick = () =>
          mutate((d) => {
            const index = d.elements.findIndex((e) => e.id === el.id),
              [item] = d.elements.splice(index, 1);
            button.dataset.order === 'front' ? d.elements.push(item) : d.elements.unshift(item);
          })),
    );
    pane.querySelector('.flyer-hide-element').onclick = () =>
      mutate((d) => {
        const item = d.elements.find((e) => e.id === el.id);
        item.hidden = !item.hidden;
      });
    pane.querySelector('.flyer-download-layer').onclick = async () => {
      try {
        downloadBlob(
          await createLayerPngBlob(selected()),
          safeName(el.label || el.name || el.text || 'camada') + '.png',
        );
        message('Camada exportada em PNG com fundo transparente.');
      } catch (error) {
        message(error.message, true);
      }
    };
    const form = pane.querySelector('form');
    form.onsubmit = (e) => e.preventDefault();
    form.querySelectorAll('input:not([type=file]),select,textarea').forEach(
      (input) => {
        if (input.name === 'text' && el.offerField === 'price') {
          bindOfferPriceInput(input, () => applyProps(form));
          return;
        }
        input.onchange = () => {
          if (!input.classList.contains('flyer-replace-product')) applyProps(form);
        };
      },
    );
    pane.querySelectorAll('[data-nudge]').forEach(
      (button) =>
        (button.onclick = () => {
          const [x, y] = button.dataset.nudge.split(',').map(Number);
          mutate((d) => {
            const item = d.elements.find((e) => e.id === S.selection);
            item.x += x;
            item.y += y;
          });
        }),
    );
    pane.querySelector('.flyer-lock').onclick = () =>
      mutate((d) => {
        const item = d.elements.find((e) => e.id === S.selection);
        item.locked = !item.locked;
      });
    pane.querySelector('.flyer-duplicate-element').onclick = () =>
      mutate((d) => {
        const item = duplicateElement(selected());
        d.elements.push(item);
        S.selection = item.id;
      });
    pane.querySelector('.flyer-delete-element').onclick = () =>
      mutate((d) => {
        d.elements = d.elements.filter((e) => e.id !== S.selection);
        S.selection = null;
      });
    pane.querySelector('.flyer-replace-photo')?.addEventListener('change', async (e) => {
      const id = el.id,
        designId = S.design.id,
        control = e.currentTarget;
      try {
        const file = e.target.files[0];
        if (!file) return;
        const image = await readPhoto(file);
        if (!isCurrent() || !control.isConnected || S.design.id !== designId) return;
        mutate((d) => {
          const item = d.elements.find((e) => e.id === id);
          if (item) {
            if (item.type === 'product') {
              item.image = image;
              item.placeholder = false;
            } else item.src = image;
          }
        });
      } catch (error) {
        if (isCurrent() && control.isConnected && S.design.id === designId) message(error.message, true);
      }
    });
  };

  return renderProperties;
}
