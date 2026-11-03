// Keep the current screen visible while a module's JavaScript is loading. Each
// navigation owns its commit, so a slower import cannot replace a newer route.
export function createRouteNavigation() {
  let active = null;

  function reset() {
    active = null;
  }

  function open(root, { href, activeModule, allowed = true }) {
    if (active?.root === root && active.href === href && !active.failed) return active.promise;
    const request = { root, href, failed: false, promise: null };
    active = request;
    const isCurrent = () => active === request && root.isConnected;
    const previous = root.querySelector('#content');
    previous.setAttribute('aria-busy', 'true');
    previous.inert = true;
    let content;

    function replaceContent() {
      content = document.createElement('main');
      content.id = 'content';
      content.tabIndex = -1;
      content.setAttribute('aria-label', 'Conteúdo do módulo');
      content.setAttribute('aria-busy', 'true');
      content.innerHTML = '<p role="status">Carregando módulo…</p>';
      root.querySelector('#content').replaceWith(content);
      return content;
    }

    request.promise = (async () => {
      try {
        if (!allowed) throw Error('Seu perfil não tem acesso a este módulo. Selecione uma opção disponível no menu.');
        const mod = await activeModule.load();
        if (!isCurrent()) return;
        replaceContent();
        await mod.render(content);
        if (isCurrent() && !root.querySelector('dialog[open]')) {
          content.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        }
      } catch (error) {
        request.failed = true;
        if (isCurrent()) {
          if (!content) replaceContent();
          content.textContent = error.message || 'Não foi possível abrir este módulo. Recarregue a página.';
          console.error(error);
        }
      } finally {
        content?.removeAttribute('aria-busy');
      }
    })();
    return request.promise;
  }

  return { open, reset };
}
