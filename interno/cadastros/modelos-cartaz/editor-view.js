import { escapeHtml as esc } from "../../../shared/ui.js";
import { SIZES, ELEMENTS } from "./definition.js";
import { FONT_GROUPS } from "./fonts.js";
const fontOptions = () => Object.entries(FONT_GROUPS).map(([group, fonts]) =>
  `<optgroup label="${esc(group)}">${fonts.map((font) => `<option>${esc(font)}</option>`).join('')}</optgroup>`,
).join('');
const field = (name, label, min, max, step = "any") =>
  `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal" required></label>`;

export function editorMarkup({ creating, draft, selected }) {
  return `<form class="poster-editor-form"><header class="poster-editor-header"><div><span class="eyebrow">MODELO DE CARTAZ</span><h2 id="poster-editor-title">${creating ? "Criar novo modelo" : "Editar modelo"}</h2><p id="poster-editor-description">Selecione um elemento para mover, redimensionar e ajustar sua fonte.</p></div><button type="button" class="poster-editor-close" data-close aria-label="Fechar editor">×</button></header><div class="poster-editor-body"><aside class="poster-editor-properties"><section><h3>Folha e aparência</h3><label>Nome do modelo<input name="name" maxlength="60" value="${esc(draft.name)}" required></label><div class="poster-paper-presets" aria-label="Tamanhos iniciais">${Object.entries(
    SIZES,
  )
    .map(
      ([id, size]) =>
        `<button type="button" data-paper="${id}" aria-label="Usar folha ${size.paper}, ${size.widthMm} por ${size.heightMm} milímetros">${size.paper}</button>`,
    )
    .join(
      "",
    )}</div><div class="poster-editor-fields"><label>Largura (mm)<input name="widthMm" type="text" inputmode="decimal" value="${draft.widthMm}" required></label><label>Altura (mm)<input name="heightMm" type="text" inputmode="decimal" value="${draft.heightMm}" required></label><label>Cor do texto<input name="color" type="color" value="${draft.color}"></label><label>Cor de fundo<input name="background" type="color" value="${draft.background}"></label></div><label>Texto da chamada<textarea name="headline" maxlength="120" rows="2" required>${esc(draft.headline)}</textarea></label><label>Texto do produto<textarea name="productText" maxlength="300" rows="3" required aria-describedby="poster-product-text-help">${esc(draft.productText)}</textarea></label><p class="poster-property-help" id="poster-product-text-help">Mantenha {{produto}} para usar o nome de cada produto. Enter cria uma nova linha. O nome exibido também pode ser ajustado em Promoções.</p></section><section><h3>Elementos do cartaz</h3><div class="poster-element-list" aria-label="Selecionar elemento">${Object.entries(
    ELEMENTS,
  )
    .map(
      ([key, label]) =>
        `<button type="button" data-select-element="${key}" aria-pressed="${key === selected}">${label}</button>`,
    )
    .join(
      "",
    )}</div><fieldset class="poster-element-properties"><legend>Produto selecionado</legend><button type="button" class="button secondary poster-toggle-element" data-toggle-element>Remover elemento</button><p class="poster-element-visibility" role="status"></p><label>Fonte<select name="fontFamily">${fontOptions()}</select></label>${field("fontSize", "Tamanho da fonte (% da largura útil)", 1.5, 55)}<div class="poster-editor-fields">${field("letterSpacing", "Entre letras (em)", -0.1, 0.5)}${field("lineHeight", "Entre linhas", 0.7, 3)}</div><div class="poster-align-controls" aria-label="Alinhamento">${[
    ["left", "Esquerda"],
    ["center", "Centro"],
    ["right", "Direita"],
  ]
    .map(([value, label]) => `<button type="button" data-align="${value}" aria-pressed="false">${label}</button>`)
    .join(
      "",
    )}</div><div class="poster-center-controls"><button type="button" class="button secondary" data-center="horizontal">Centralizar na horizontal ↔</button><button type="button" class="button secondary" data-center="vertical">Centralizar na vertical ↕</button></div><div class="poster-editor-fields">${field("x", "Posição X (%)", 0, 92)}${field("y", "Posição Y (%)", 0, 96.5)}${field("w", "Largura (%)", 8, 100)}${field("h", "Altura (%)", 3.5, 100)}</div><p class="poster-property-help">Posições e caixas usam a área útil, com margem de 5 mm. Você também pode usar as setas do teclado no elemento; Shift faz passos maiores.</p></fieldset></section></aside><section class="poster-editor-workarea" aria-label="Prévia visual do modelo"><div class="poster-canvas-toolbar"><strong>Prévia do cartaz</strong><span class="poster-editor-dimensions"></span></div><div class="poster-editor-ruler-frame"><div class="poster-editor-paper"><div class="poster-ruler-corner" aria-hidden="true">mm</div><div class="poster-ruler poster-ruler-top" aria-hidden="true"></div><div class="poster-ruler poster-ruler-left" aria-hidden="true"></div><div class="poster-editor-canvas"><div class="poster-editor-art" aria-hidden="true"></div><div class="poster-alignment-guides" aria-hidden="true"><span class="poster-center-guide poster-center-guide-vertical" hidden></span><span class="poster-center-guide poster-center-guide-horizontal" hidden></span></div><div class="poster-editor-objects">${Object.entries(
    ELEMENTS,
  )
    .map(
      ([key, label]) =>
        `<div class="poster-object" data-object="${key}" data-label="${label}"><button type="button" class="poster-object-move" data-drag="${key}" aria-label="Selecionar e mover ${label}"></button><button type="button" class="poster-object-resize" data-resize="${key}" aria-label="Redimensionar ${label}" title="Arraste para redimensionar">↘</button></div>`,
    )
    .join(
      "",
    )}</div></div></div></div><p class="poster-canvas-help">As réguas mostram a folha em milímetros. Arraste próximo ao centro para encaixar nas guias. Arraste o elemento. Use a alça ↘ para mudar a caixa e o campo “Tamanho da fonte” para aumentar o texto.</p></section></div><footer class="poster-editor-footer"><div><p class="poster-editor-status" role="status" aria-live="polite"></p><span class="poster-dirty-status">${creating ? "Novo modelo" : "Sem alterações"}</span></div><div class="poster-editor-actions">${creating ? "" : '<button class="button secondary poster-delete-model" type="button" data-delete-model>Excluir modelo</button>'}<button class="button secondary" type="button" data-close>Cancelar</button><button class="button primary" type="submit">Salvar modelo</button></div></footer></form>`;
}
