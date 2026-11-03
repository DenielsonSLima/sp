import { validateDesign } from './model.js';

export const documentFormats = [
  ['square', 'Post quadrado', 1080, 1080],
  ['portrait', 'Post retrato', 1080, 1350],
  ['story', 'Story', 1080, 1920],
  ['a4', 'A4 · 150 dpi', 1240, 1754],
];

export function configureDesign(design, { width, height, bgColor }) {
  const next = { ...validateDesign(design), width: Number(width), height: Number(height), bgColor };
  const sx = next.width / design.width,
    sy = next.height / design.height;
  if (next.guides)
    next.guides = { x: next.guides.x.map((value) => value * sx), y: next.guides.y.map((value) => value * sy) };
  if (sx !== 1 || sy !== 1)
    next.elements = next.elements.map((element) => ({
      ...element,
      x: element.x * sx,
      y: element.y * sy,
      width: element.width * sx,
      height: element.height * sy,
      ...(element.fontSize ? { fontSize: element.fontSize * Math.min(sx, sy) } : {}),
    }));
  return validateDesign(next);
}

export function openDocumentSettings({ design, onApply }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'flyer-settings-dialog';
  dialog.setAttribute('aria-labelledby', 'flyer-settings-title');
  const color = /^#[0-9a-f]{3}$/i.test(design.bgColor)
    ? '#' + [...design.bgColor.slice(1)].map((c) => c + c).join('')
    : design.bgColor;
  dialog.innerHTML = `<form><header><div><span class="flyer-settings-kicker">DOCUMENTO</span><h2 id="flyer-settings-title">Configurações da arte</h2></div><button type="button" class="flyer-settings-close" aria-label="Fechar configurações">×</button></header><div class="flyer-settings-body"><fieldset class="flyer-settings-formats"><legend>Formato</legend><div>${[...documentFormats, ['custom', 'Personalizado', 0, 0]].map(([key, label, width, height]) => `<button type="button" data-format="${key}" aria-pressed="false"><span class="flyer-preset-icon ${key}" aria-hidden="true"></span><span><strong>${label}</strong><small>${width ? `${width} × ${height} px` : 'Defina suas medidas'}</small></span></button>`).join('')}</div></fieldset><fieldset class="flyer-settings-size"><legend>Dimensões em pixels</legend><div><label>Largura<input name="width" type="number" min="320" max="4096" step="1" required value="${design.width}"></label><span aria-hidden="true">×</span><label>Altura<input name="height" type="number" min="320" max="4096" step="1" required value="${design.height}"></label></div><p>Ao mudar o tamanho, os elementos acompanham as novas dimensões.</p></fieldset><label class="flyer-settings-background"><span>Cor de fundo<small>Preenchimento atrás das camadas da arte.</small></span><input name="background" type="color" value="${color}"></label><p class="flyer-settings-error" role="status" aria-live="polite"></p></div><footer><button type="button" class="button secondary flyer-settings-cancel">Cancelar</button><button type="submit" class="button primary">Aplicar alterações</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'),
    width = form.elements.width,
    height = form.elements.height;
  const sync = () => {
    const preset = documentFormats.find(([, , w, h]) => w === Number(width.value) && h === Number(height.value));
    dialog
      .querySelectorAll('[data-format]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.format === (preset?.[0] || 'custom'))),
      );
  };
  dialog.querySelectorAll('[data-format]').forEach(
    (button) =>
      (button.onclick = () => {
        const preset = documentFormats.find(([key]) => key === button.dataset.format);
        if (preset) {
          width.value = preset[2];
          height.value = preset[3];
          sync();
        } else {
          dialog
            .querySelectorAll('[data-format]')
            .forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
          width.focus();
          width.select();
        }
      }),
  );
  width.oninput = sync;
  height.oninput = sync;
  const cleanup = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.querySelector('.flyer-settings-close').onclick = cleanup;
  dialog.querySelector('.flyer-settings-cancel').onclick = cleanup;
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) cleanup();
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    try {
      const next = configureDesign(design, {
        width: width.value,
        height: height.value,
        bgColor: form.elements.background.value,
      });
      if (onApply(next) !== false) cleanup();
    } catch (error) {
      dialog.querySelector('.flyer-settings-error').textContent = error.message;
    }
  };
  sync();
  dialog.showModal();
  dialog.querySelector('[aria-pressed=true]')?.focus();
  return cleanup;
}
