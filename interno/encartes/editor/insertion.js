import { createTextElement, newId } from '../model.js';
import { readPhoto } from '../../cadastros/produtos/photo.js';
export function renderInsertionPanel({ pane, root, state: S, mutate, message, onLibrary }) {
  pane.innerHTML = `<h2>Adicionar à arte</h2><p class="flyer-help">Escolha o que deseja inserir.</p><div class="studio-insert-actions"><button class="studio-insert-action flyer-add-text" type="button"><span aria-hidden="true">T</span><strong>Texto<small>Título, preço ou validade</small></strong><b aria-hidden="true">＋</b></button><button class="studio-insert-action flyer-add-image" type="button"><span aria-hidden="true">▧</span><strong>Imagem<small>PNG, JPEG ou WebP</small></strong><b aria-hidden="true">＋</b></button><button class="studio-insert-action flyer-add-logo" type="button"><span aria-hidden="true">◇</span><strong>Logo e elementos<small>Escolher na biblioteca</small></strong><b aria-hidden="true">→</b></button><button class="studio-insert-action flyer-add-shape" type="button"><span aria-hidden="true">▰</span><strong>Faixa de cor<small>Destaque para sua oferta</small></strong><b aria-hidden="true">＋</b></button></div><input type="file" accept="image/png,image/jpeg,image/webp" class="flyer-image-file" aria-label="Selecionar imagem para inserir" hidden><p class="studio-insert-note">Selecione uma camada para editar suas propriedades no painel à direita.</p>`;
  pane.querySelector('.flyer-add-text').onclick = () => {
    const element = createTextElement(S.design);
    S.selection = element.id;
    mutate((d) => d.elements.push(element));
    root.querySelector('.flyer-properties textarea')?.focus();
  };
  pane.querySelector('.flyer-add-logo').onclick = () => {
    onLibrary('Logos');
  };
  pane.querySelector('.flyer-add-shape').onclick = () => {
    const element = {
      id: newId(),
      type: 'shape',
      fill: '#c71925',
      x: 0,
      y: 0,
      width: S.design.width,
      height: S.design.height * 0.14,
      locked: false,
    };
    S.selection = element.id;
    mutate((d) => d.elements.push(element));
  };
  pane.querySelector('.flyer-add-image').onclick = () => pane.querySelector('.flyer-image-file').click();
  pane.querySelector('.flyer-image-file').onchange = async (e) => {
    const control = e.currentTarget,
      designId = S.design.id;
    try {
      const file = e.target.files[0];
      if (!file) return;
      const src = await readPhoto(file);
      if (!root.isConnected || !control.isConnected || S.design.id !== designId) return;
      const element = {
        id: newId(),
        type: 'image',
        label: file.name.replace(/\.[^.]+$/, ''),
        src,
        x: S.design.width * 0.15,
        y: S.design.height * 0.15,
        width: S.design.width * 0.7,
        height: S.design.height * 0.5,
        locked: false,
      };
      S.selection = element.id;
      mutate((d) => d.elements.push(element));
    } catch (error) {
      if (control.isConnected && S.design.id === designId) message(error.message, true);
    }
  };
}
