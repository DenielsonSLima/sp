// Expanded studio mode keeps the same canvas and permits body-mounted dialogs.
export function bindStudioFullscreen(root, { onResize = () => {} } = {}) {
  const studio = root.querySelector('.flyer-studio'),
    button = root.querySelector('.flyer-fullscreen');
  if (!studio || !button) return () => {};
  const doc = studio.ownerDocument,
    win = doc.defaultView,
    label = button.querySelector('[data-fullscreen-label]') || button,
    page = doc.documentElement,
    body = doc.body;
  let expanded = false,
    disposed = false,
    frame = null,
    snapshot = null;

  const resize = () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = null;
      if (!disposed && root.isConnected && studio.isConnected) onResize();
    });
  };
  const reflect = () => {
    label.textContent = expanded ? 'Sair da tela cheia' : 'Tela cheia';
    button.setAttribute('aria-pressed', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Sair da tela cheia' : 'Tela cheia');
    button.title = expanded ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
  };
  const exit = ({ restoreFocus = true, notify = true } = {}) => {
    if (!expanded) return;
    expanded = false;
    studio.classList.remove('is-fullscreen');
    if (!snapshot.pageLocked) page.classList.remove('flyer-fullscreen-open');
    if (!snapshot.bodyLocked) body.classList.remove('flyer-fullscreen-open');
    snapshot.inert.forEach(([element, previous]) => (element.inert = previous));
    reflect();
    win.scrollTo({ left: snapshot.scrollX, top: snapshot.scrollY, behavior: 'instant' });
    if (restoreFocus && snapshot.focus?.isConnected) snapshot.focus.focus({ preventScroll: true });
    snapshot = null;
    if (notify) resize();
  };
  const enter = () => {
    if (disposed || expanded || !studio.isConnected) return;
    snapshot = {
      focus: doc.activeElement,
      scrollX: win.scrollX,
      scrollY: win.scrollY,
      pageLocked: page.classList.contains('flyer-fullscreen-open'),
      bodyLocked: body.classList.contains('flyer-fullscreen-open'),
      inert: [],
    };
    // Enhanced selectors mount their lists in body before this mode is entered.
    const portals = new Set(
      [...studio.querySelectorAll('.custom-select-trigger[aria-controls]')]
        .map((trigger) => doc.getElementById(trigger.getAttribute('aria-controls'))?.closest('.custom-select-popup'))
        .filter(Boolean),
    );
    // Keep only this studio's existing portals interactive alongside its controls.
    for (let node = studio; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !portals.has(sibling) && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
          snapshot.inert.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      if (node.parentElement === body) break;
    }
    expanded = true;
    page.classList.add('flyer-fullscreen-open');
    body.classList.add('flyer-fullscreen-open');
    studio.classList.add('is-fullscreen');
    reflect();
    button.focus({ preventScroll: true });
    resize();
  };
  const toggle = () => (expanded ? exit() : enter());
  const onKeydown = (event) => {
    if (!expanded || event.key !== 'Escape' || event.defaultPrevented) return;
    // Let the active modal consume Esc; a second Esc leaves expanded mode.
    if (doc.querySelector('dialog[open], [aria-modal="true"]')) return;
    event.preventDefault();
    exit();
  };
  button.addEventListener('click', toggle);
  doc.addEventListener('keydown', onKeydown);
  reflect();
  return () => {
    if (disposed) return;
    disposed = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    button.removeEventListener('click', toggle);
    doc.removeEventListener('keydown', onKeydown);
    exit({ restoreFocus: false, notify: false });
  };
}
