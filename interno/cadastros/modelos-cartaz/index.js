import { watchPosterTemplates } from "./realtime.js";
import { resourceError } from "../remote.js";
import { heading, escapeHtml as esc } from "../../../shared/ui.js";
import { templates, loadTemplates, miniMarkup, dimensionLabel, storageWarning } from "./model.js";
import { openTemplateEditor, confirmTemplateDeletion } from "./editor.js";
export async function render(root) {
  try {
    await loadTemplates();
  } catch (error) {
    resourceError(root, error);
    return;
  }
  root.innerHTML = `<link rel="stylesheet" href="./interno/cadastros/modelos-cartaz/styles.css"><div class="page-heading-actions">${heading("CADASTROS", "Modelos de cartaz")}<div class="poster-gallery-actions"><a class="button secondary" href="#promocoes">Abrir Promoções →</a><button class="button primary" type="button" data-create-template>+ Criar novo</button></div></div><p class="poster-gallery-status" role="status" aria-live="polite">${esc(storageWarning)}</p><section class="poster-template-grid" aria-label="Modelos disponíveis"></section><p class="poster-note">Na impressão, selecione o papel do modelo, escala 100%, sem cabeçalhos e rodapés, e habilite gráficos de fundo.</p>`;
  const gallery = root.querySelector(".poster-template-grid"),
    status = root.querySelector(".poster-gallery-status");
  function deleted(template) {
    paintGallery();
    status.textContent = `Modelo “${template.name}” excluído. As campanhas salvas mantêm seus cartazes.`;
    root.querySelector("[data-create-template]").focus();
  }
  async function edit(template) {
    try {
      await openTemplateEditor({
        host: root,
        template,
        onSaved: (saved) => {
          paintGallery();
          status.textContent = `Modelo “${saved.name}” salvo e disponível em Promoções.`;
          gallery.querySelector(`[data-template-id="${saved.id}"]`)?.focus();
        },
        onDeleted: deleted,
      });
    } catch (error) {
      status.textContent = error.message;
    }
  }
  let renderedSignature = "";
  function paintGallery() {
    const signature = JSON.stringify([
      templates,
      root.querySelector("[type=search]")?.value,
      root.querySelector(".category-filter")?.value,
    ]);
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    gallery.innerHTML = templates.length
      ? templates
          .map(
            (t) =>
              `<article class="card poster-template-card"><button type="button" class="poster-template" data-template-id="${esc(t.id)}" aria-label="Editar modelo ${esc(t.name)}, ${esc(dimensionLabel(t))}"><span class="poster-template-title"><strong>${esc(t.name)}</strong><span>${esc(dimensionLabel(t))}</span></span><span class="poster-mini-preview" aria-hidden="true">${miniMarkup(t)}</span><span class="poster-template-footer"><span>${Object.values(t.layout).filter((e) => !e.hidden).length} elementos visíveis</span><b>Editar modelo ↗</b></span></button><div class="poster-card-actions"><button type="button" class="button secondary poster-delete-model" data-delete-template="${esc(t.id)}" aria-label="Excluir modelo ${esc(t.name)}">Excluir modelo</button></div></article>`,
          )
          .join("")
      : '<div class="card poster-gallery-empty"><h2>Nenhum modelo cadastrado</h2><p>Crie um modelo para preparar os próximos cartazes.</p><button class="button primary" type="button" data-empty-create>+ Criar novo modelo</button></div>';
    gallery
      .querySelectorAll("[data-template-id]")
      .forEach((button) => (button.onclick = () => edit(templates.find((t) => t.id === button.dataset.templateId))));
    gallery.querySelectorAll("[data-delete-template]").forEach(
      (button) =>
        (button.onclick = async () => {
          const template = templates.find((t) => t.id === button.dataset.deleteTemplate);
          if (!template) return;
          const removed = await confirmTemplateDeletion({ host: root, template });
          if (removed) deleted(removed);
        }),
    );
    gallery.querySelector("[data-empty-create]")?.addEventListener("click", () => edit());
  }
  root.querySelector("[data-create-template]").onclick = () => edit();
  paintGallery();
  watchPosterTemplates(root, paintGallery);
}
