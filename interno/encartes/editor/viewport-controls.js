import { bindStudioFullscreen } from './fullscreen.js';
import { centralizeElement } from './alignment.js';
import { bindStudioZoom } from './zoom.js';

export function bindStudioViewport(root, { renderer, state, mutate }) {
  const stopFullscreen = bindStudioFullscreen(root, { onResize: renderer.requestDraw });
  const stopZoom = bindStudioZoom(root, { renderer, state });
  const stopViewport = () => {
    stopZoom();
    stopFullscreen();
  };
  const button = root.querySelector('.flyer-guides-toggle'),
    menu = root.querySelector('.flyer-guides-menu'),
    doc = root.ownerDocument;
  renderer.onGuideChange((guides) =>
    mutate(
      (design) => {
        design.guides = guides;
      },
      { panel: false },
    ),
  );
  if (!button || !menu) return stopViewport;
  const center = menu.querySelector('[data-show-center]');
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const reflect = () => {
    center.checked = renderer.isCenterVisible();
    const selected = state.design.elements.find((item) => item.id === state.selection);
    menu.querySelectorAll('[data-align]').forEach((action) => {
      action.disabled = !selected || selected.locked;
    });
  };
  button.onclick = () => {
    const opened = menu.hidden;
    menu.hidden = !opened;
    button.setAttribute('aria-expanded', String(opened));
    if (opened) reflect();
  };
  center.onchange = () => renderer.setCenterVisible(center.checked);
  menu.querySelector('[data-clear-guides]').onclick = () => {
    renderer.clearGuides();
    close();
  };
  menu.querySelectorAll('[data-align]').forEach((action) => {
    action.onclick = () => {
      const id = state.selection;
      if (!id) return;
      mutate((design) => {
        design.elements = centralizeElement(design, id, action.dataset.align).elements;
      });
      close();
    };
  });
  const outside = (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  };
  const keydown = (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    close();
    event.preventDefault();
    event.stopPropagation();
    button.focus();
  };
  doc.addEventListener('pointerdown', outside);
  doc.addEventListener('keydown', keydown, true);
  return () => {
    doc.removeEventListener('pointerdown', outside);
    doc.removeEventListener('keydown', keydown, true);
    renderer.onGuideChange(() => {});
    stopViewport();
  };
}
