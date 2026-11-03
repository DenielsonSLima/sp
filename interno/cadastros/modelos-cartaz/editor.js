import { editorMarkup } from "./editor-view.js";
import { confirmTemplateDeletion, trapFocus } from "./dialogs.js";
export { confirmTemplateDeletion } from "./dialogs.js";
import { escapeHtml as esc } from "../../../shared/ui.js";
import {
  ELEMENTS,
  createTemplateDraft,
  normalizeTemplate,
  validateElement,
  constrainElement,
  createTemplate,
  saveTemplate,
  posterMarkup,
  sampleOffer,
  paperStyle,
  elementStyle,
  dimensionLabel,
} from "./model.js";
import { rulerTicks, centerElement, snapElementToCenter } from "./geometry.js";
const clone = (value) => JSON.parse(JSON.stringify(value));
const openingEditors = new WeakSet();
const percent = (value) => Number((value * 100).toFixed(2));
export async function openTemplateEditor({ host, template, onSaved, onDeleted }) {
  if (host.querySelector(".poster-editor-dialog") || openingEditors.has(host)) return;
  openingEditors.add(host);
  let initial;
  try {
    initial = template ? normalizeTemplate(clone(template)) : await createTemplateDraft();
  } finally {
    openingEditors.delete(host);
  }
  if (!host.isConnected || host.querySelector(".poster-editor-dialog")) return;
  const creating = !template,
    opener = document.activeElement;
  let draft = initial,
    selected = "product",
    dirty = false,
    gesture = null,
    closed = false,
    confirmation = null,
    deleting = false,
    saving = false,
    alignmentGuides = { vertical: false, horizontal: false },
    rulerSignature = "";
  const dialog = document.createElement("dialog");
  dialog.className = "poster-editor-dialog";
  dialog.setAttribute("aria-labelledby", "poster-editor-title");
  dialog.setAttribute("aria-describedby", "poster-editor-description");
  dialog.innerHTML = editorMarkup({ creating, draft, selected });
  host.append(dialog);
  const form = dialog.querySelector("form"),
    status = dialog.querySelector(".poster-editor-status"),
    canvas = dialog.querySelector(".poster-editor-canvas"),
    art = dialog.querySelector(".poster-editor-art"),
    paper = dialog.querySelector(".poster-editor-paper");
  const templateFields = ["name", "widthMm", "heightMm", "color", "background", "headline", "productText"],
    propertyFields = ["x", "y", "w", "h", "fontSize", "fontFamily", "letterSpacing", "lineHeight"];
  const setDirty = () => {
    dirty = true;
    dialog.querySelector(".poster-dirty-status").textContent = "Alterações não salvas";
  };
  const showError = (error) => {
    status.textContent = error.message;
    status.classList.add("is-error");
  };
  const clearError = () => {
    status.textContent = "";
    status.classList.remove("is-error");
  };
  function syncProperties() {
    const element = draft.layout[selected];
    for (const key of ["x", "y", "w", "h"]) form.elements[key].value = percent(element[key]);
    form.elements.fontSize.value = element.fontSize;
    form.elements.fontFamily.value = element.fontFamily;
    form.elements.letterSpacing.value = element.letterSpacing;
    form.elements.lineHeight.value = element.lineHeight;
    dialog.querySelector("[data-toggle-element]").textContent = element.hidden
      ? "Restaurar elemento"
      : "Remover elemento";
    dialog.querySelector(".poster-element-visibility").textContent = element.hidden
      ? "Elemento removido. Restaure para voltar a exibi-lo."
      : "";
    dialog.querySelectorAll("[data-center]").forEach((button) => (button.disabled = element.hidden));
    dialog.querySelector("legend").textContent = `${ELEMENTS[selected]} selecionado`;
    dialog
      .querySelectorAll("[data-align]")
      .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.align === element.align)));
    dialog.querySelectorAll("[data-select-element]").forEach((button) => {
      const key = button.dataset.selectElement;
      button.setAttribute("aria-pressed", String(key === selected));
      button.textContent = ELEMENTS[key] + (draft.layout[key].hidden ? " · removido" : "");
      button.classList.toggle("is-removed", draft.layout[key].hidden);
    });
    dialog.querySelectorAll("[data-object]").forEach((box) => {
      const active = box.dataset.object === selected;
      box.hidden = draft.layout[box.dataset.object].hidden;
      box.classList.toggle("is-selected", active);
      box.querySelector("[data-resize]").tabIndex = active ? 0 : -1;
      box.querySelector("[data-resize]").hidden = !active;
      box.querySelector("[data-drag]").setAttribute("aria-pressed", String(active));
    });
  }
  function paintRulers() {
    const rect = paper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const signature = [draft.widthMm, draft.heightMm, rect.width.toFixed(1), rect.height.toFixed(1)].join("/");
    if (signature === rulerSignature) return;
    rulerSignature = signature;
    for (const [orientation, mm, pixels] of [
      ["top", draft.widthMm, rect.width],
      ["left", draft.heightMm, rect.height],
    ]) {
      const axis = orientation === "top" ? "left" : "top";
      dialog.querySelector(`.poster-ruler-${orientation}`).innerHTML = rulerTicks(mm, pixels)
        .ticks.map(
          (tick) =>
            `<span class="poster-ruler-tick ${tick.major ? "is-major" : ""} ${tick.edge ? "is-" + tick.edge : ""}" style="${axis}:${tick.position * 100}%">${tick.label ? `<b>${tick.mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>` : ""}</span>`,
        )
        .join("");
    }
  }
  function paintGuides() {
    const element = draft.layout[selected];
    dialog.querySelector(".poster-center-guide-vertical").hidden =
      element.hidden || !alignmentGuides.vertical || Math.abs(element.x + element.w / 2 - 0.5) > 0.000001;
    dialog.querySelector(".poster-center-guide-horizontal").hidden =
      element.hidden || !alignmentGuides.horizontal || Math.abs(element.y + element.h / 2 - 0.5) > 0.000001;
  }
  function paint() {
    paper.style.cssText = `${paperStyle(draft)};--editor-paper-width:${Math.min(430, (570 * draft.widthMm) / draft.heightMm).toFixed(2)}px`;
    art.innerHTML = posterMarkup(sampleOffer(draft.id), draft);
    dialog.querySelector(".poster-editor-dimensions").textContent = dimensionLabel(draft);
    dialog
      .querySelectorAll("[data-object]")
      .forEach((box) => (box.style.cssText = elementStyle(draft.layout[box.dataset.object])));
    paintRulers();
    paintGuides();
  }
  function readProperties() {
    const next = { ...draft.layout[selected] };
    for (const key of propertyFields) {
      const value = form.elements[key].value;
      if (key === "fontFamily") next[key] = value;
      else {
        if (value.trim() === "") throw Error("Preencha a posição, o tamanho e a fonte do elemento.");
        next[key] = Number(value) / (["x", "y", "w", "h"].includes(key) ? 100 : 1);
      }
    }
    return validateElement(next);
  }
  function applyProperties() {
    draft.layout[selected] = readProperties();
  }
  function readTemplate() {
    const values = Object.fromEntries(templateFields.map((key) => [key, form.elements[key].value]));
    return normalizeTemplate({ ...draft, ...values });
  }
  function selectElement(key) {
    try {
      applyProperties();
      clearError();
    } catch (error) {
      showError(error);
      return false;
    }
    selected = key;
    alignmentGuides = { vertical: false, horizontal: false };
    syncProperties();
    paint();
    return true;
  }
  function closeEditor() {
    if (closed) return;
    closed = true;
    observer.disconnect();
    rulerObserver?.disconnect();
    window.removeEventListener("resize", paintRulers);
    confirmation?.close();
    confirmation?.remove();
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    if (opener?.isConnected) opener.focus();
  }
  function requestClose() {
    if (saving) {
      status.textContent = "Aguarde a confirmação do salvamento.";
      return;
    }
    if (confirmation) return;
    if (!dirty) {
      closeEditor();
      return;
    }
    const previousFocus = document.activeElement;
    confirmation = document.createElement("dialog");
    confirmation.className = "poster-discard-dialog";
    confirmation.setAttribute("aria-labelledby", "poster-discard-title");
    confirmation.setAttribute("aria-describedby", "poster-discard-description");
    confirmation.innerHTML =
      '<h2 id="poster-discard-title">Descartar alterações?</h2><p id="poster-discard-description">O modelo ainda não foi salvo. Você pode continuar editando sem perder suas mudanças.</p><div><button type="button" class="button secondary" data-keep autofocus>Continuar editando</button><button type="button" class="button primary" data-discard>Descartar alterações</button></div>';
    host.append(confirmation);
    const keep = () => {
      confirmation.close();
      confirmation.remove();
      confirmation = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    confirmation.querySelector("[data-keep]").onclick = keep;
    confirmation.querySelector("[data-discard]").onclick = () => {
      confirmation.close();
      confirmation.remove();
      confirmation = null;
      closeEditor();
    };
    confirmation.addEventListener("cancel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      keep();
    });
    confirmation.addEventListener("keydown", (event) => trapFocus(confirmation, event));
    confirmation.showModal();
    confirmation.querySelector("[data-keep]").focus();
  }
  function toggleElement() {
    try {
      applyProperties();
      draft.layout[selected].hidden = !draft.layout[selected].hidden;
      setDirty();
      clearError();
      syncProperties();
      paint();
      dialog.querySelector("[data-toggle-element]").focus();
    } catch (error) {
      showError(error);
    }
  }
  dialog.querySelector("[data-toggle-element]").onclick = toggleElement;
  dialog.querySelectorAll("[data-center]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          applyProperties();
          draft.layout[selected] = centerElement(draft.layout[selected], button.dataset.center);
          alignmentGuides = {
            vertical: button.dataset.center === "horizontal",
            horizontal: button.dataset.center === "vertical",
          };
          setDirty();
          clearError();
          syncProperties();
          paint();
          status.textContent = `${ELEMENTS[selected]} centralizado ${button.dataset.center === "horizontal" ? "na horizontal" : "na vertical"}.`;
        } catch (error) {
          showError(error);
        }
      }),
  );
  const deleteButton = dialog.querySelector("[data-delete-model]");
  if (deleteButton)
    deleteButton.onclick = async () => {
      if (deleting || saving) return;
      deleting = true;
      try {
        const removed = await confirmTemplateDeletion({ host, template: { ...draft, _version: template?._version } });
        if (removed) {
          closeEditor();
          onDeleted?.(removed);
        }
      } catch (error) {
        showError(error);
      } finally {
        deleting = false;
      }
    };
  dialog.querySelectorAll("[data-close]").forEach((button) => (button.onclick = requestClose));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  });
  dialog.addEventListener("keydown", (event) => trapFocus(dialog, event));
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      requestClose();
  });
  dialog
    .querySelectorAll("[data-select-element]")
    .forEach((button) => (button.onclick = () => selectElement(button.dataset.selectElement)));
  dialog.querySelectorAll("[data-paper]").forEach(
    (button) =>
      (button.onclick = () => {
        const size = SIZES[button.dataset.paper];
        form.elements.widthMm.value = size.widthMm;
        form.elements.heightMm.value = size.heightMm;
        setDirty();
        try {
          draft = readTemplate();
          clearError();
          paint();
        } catch (error) {
          showError(error);
        }
      }),
  );
  for (const key of templateFields)
    form.elements[key].addEventListener("input", () => {
      setDirty();
      try {
        draft = readTemplate();
        clearError();
        paint();
      } catch (error) {
        showError(error);
      }
    });
  for (const key of propertyFields)
    form.elements[key].addEventListener(key === "fontFamily" ? "change" : "input", () => {
      setDirty();
      try {
        applyProperties();
        clearError();
        paint();
      } catch (error) {
        showError(error);
      }
    });
  dialog.querySelectorAll("[data-align]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          applyProperties();
          draft.layout[selected].align = button.dataset.align;
          setDirty();
          clearError();
          syncProperties();
          paint();
        } catch (error) {
          showError(error);
        }
      }),
  );
  const objects = dialog.querySelector(".poster-editor-objects");
  objects.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-drag],[data-resize]");
    if (!button || event.button !== 0 || gesture) return;
    const key = button.dataset.drag || button.dataset.resize;
    if (!selectElement(key)) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    gesture = {
      pointerId: event.pointerId,
      button,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      initial: clone(draft.layout[selected]),
      key,
      resizing: !!button.dataset.resize,
      wasDirty: dirty,
    };
    button.setPointerCapture(event.pointerId);
  });
  objects.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const g = gesture,
      dx = (event.clientX - g.startX) / g.width,
      dy = (event.clientY - g.startY) / g.height;
    const change = g.resizing
      ? { w: Math.min(1 - g.initial.x, g.initial.w + dx), h: Math.min(1 - g.initial.y, g.initial.h + dy) }
      : { x: g.initial.x + dx, y: g.initial.y + dy };
    const moved = constrainElement(g.initial, change);
    if (g.resizing) {
      draft.layout[g.key] = moved;
      alignmentGuides = { vertical: false, horizontal: false };
    } else {
      const rect = canvas.getBoundingClientRect(),
        snapped = snapElementToCenter(moved, { widthPx: rect.width, heightPx: rect.height });
      draft.layout[g.key] = snapped.element;
      alignmentGuides = snapped.guides;
    }
    setDirty();
    syncProperties();
    paint();
  });
  function endGesture(event, cancel = false) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const g = gesture;
    gesture = null;
    if (cancel) {
      draft.layout[g.key] = g.initial;
      dirty = g.wasDirty;
      dialog.querySelector(".poster-dirty-status").textContent = dirty
        ? "Alterações não salvas"
        : creating
          ? "Novo modelo"
          : "Sem alterações";
      syncProperties();
      paint();
    }
    alignmentGuides = { vertical: false, horizontal: false };
    paintGuides();
    if (g.button.hasPointerCapture(event.pointerId)) g.button.releasePointerCapture(event.pointerId);
  }
  objects.addEventListener("pointerup", (event) => endGesture(event));
  objects.addEventListener("pointercancel", (event) => endGesture(event, true));
  objects.addEventListener("lostpointercapture", (event) => endGesture(event));
  objects.addEventListener("click", (event) => {
    const button = event.target.closest("[data-drag],[data-resize]");
    if (button) selectElement(button.dataset.drag || button.dataset.resize);
  });
  objects.addEventListener("keydown", (event) => {
    const button = event.target.closest("[data-drag],[data-resize]");
    if (!button) return;
    if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault();
      if (selectElement(button.dataset.drag || button.dataset.resize)) toggleElement();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (!selectElement(button.dataset.drag || button.dataset.resize)) return;
    const step = event.shiftKey ? 0.02 : 0.005,
      delta = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -step : step,
      e = draft.layout[selected],
      horizontal = ["ArrowLeft", "ArrowRight"].includes(event.key);
    const key = button.dataset.resize ? (horizontal ? "w" : "h") : horizontal ? "x" : "y";
    const value = e[key] + delta;
    draft.layout[selected] = constrainElement(e, {
      [key]: button.dataset.resize ? Math.min(value, 1 - e[horizontal ? "x" : "y"]) : value,
    });
    setDirty();
    syncProperties();
    paint();
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || deleting) return;
    let controls = [];
    try {
      applyProperties();
      draft = readTemplate();
      saving = true;
      controls = [...form.querySelectorAll("button,input,select,textarea")].map((control) => [
        control,
        control.disabled,
      ]);
      controls.forEach(([control]) => (control.disabled = true));
      const saved = creating
        ? await createTemplate(draft)
        : await saveTemplate(draft.id, { ...draft, _version: template?._version });
      dirty = false;
      closeEditor();
      onSaved(saved);
    } catch (error) {
      showError(error);
    } finally {
      saving = false;
      controls.forEach(([control, disabled]) => (control.disabled = disabled));
    }
  };
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const observer = new MutationObserver(() => {
    if (!dialog.isConnected) closeEditor();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const rulerObserver = typeof ResizeObserver === "function" ? new ResizeObserver(paintRulers) : null;
  rulerObserver?.observe(paper);
  window.addEventListener("resize", paintRulers);
  syncProperties();
  paint();
  dialog.showModal();
  paintRulers();
  form.elements.name.focus();
}
