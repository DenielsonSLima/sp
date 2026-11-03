import { escapeHtml as esc } from "../../../shared/ui.js";
import { deleteTemplate } from "./state.js";
export function trapFocus(dialog, event) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const nodes = [
    ...dialog.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    ),
  ].filter((node) => node.getClientRects().length && !node.closest("[hidden]"));
  const first = nodes[0],
    last = nodes.at(-1);
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
export function confirmTemplateDeletion({ host, template }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement,
      previousOverflow = document.body.style.overflow,
      parentDialog = host.querySelector(".poster-editor-dialog");
    const modal = document.createElement("dialog");
    modal.className = "poster-discard-dialog";
    modal.setAttribute("aria-labelledby", "poster-delete-title");
    modal.setAttribute("aria-describedby", "poster-delete-description");
    modal.innerHTML = `<h2 id="poster-delete-title">Excluir este modelo?</h2><p id="poster-delete-description">O modelo “${esc(template.name)}” será removido da empresa. Campanhas já salvas mantêm sua própria cópia.</p><p class="poster-delete-status" role="status"></p><div><button type="button" class="button secondary" data-delete-cancel autofocus>Cancelar</button><button type="button" class="button primary" data-delete-confirm>Excluir modelo</button></div>`;
    host.append(modal);
    let settled = false,
      pending = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (modal.open) modal.close();
      modal.remove();
      if (!parentDialog || parentDialog.isConnected) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(result);
    };
    modal.querySelector("[data-delete-cancel]").onclick = () => {
      if (!pending) finish(null);
    };
    modal.querySelector("[data-delete-confirm]").onclick = async () => {
      if (pending) return;
      pending = true;
      modal.querySelectorAll("button").forEach((button) => (button.disabled = true));
      try {
        const removed = await deleteTemplate(template.id, { expectedVersion: template._version });
        pending = false;
        finish(removed);
      } catch (error) {
        pending = false;
        modal.querySelector("[role=status]").textContent = error.message;
        modal.querySelectorAll("button").forEach((button) => (button.disabled = false));
      }
    };
    modal.addEventListener("cancel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) finish(null);
    });
    modal.addEventListener("keydown", (event) => trapFocus(modal, event));
    const observer = new MutationObserver(() => {
      if (!modal.isConnected) finish(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.style.overflow = "hidden";
    modal.showModal();
    modal.querySelector("[data-delete-cancel]").focus();
  });
}
