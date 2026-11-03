import { confirmLogout } from '../shared/components/logout-confirmation/index.js';
import { logo, escapeHtml } from '../shared/ui.js';
import { getDataContext, subscribeConnection } from '../shared/data/api.js';
import { icon } from '../shared/icons.js';
import { modules, navigationSections, resolveRoute, resolveCadastro } from './modules.js';
import { createRouteNavigation } from './route-navigation.js';
const routeNavigation = createRouteNavigation();
let cadastrosOpen = false;
let sidebarCollapsed = false;
let controller;
let unsubscribeConnection;
let mountedShell = null;

export function disposeShell() {
  routeNavigation.reset();
  controller?.abort();
  unsubscribeConnection?.();
  unsubscribeConnection = null;
  mountedShell = null;
  document.body.style.overflow = '';
}

function updateNavigation(root, key, child, label) {
  root.querySelector('.breadcrumb strong').textContent = `${key === 'cadastros' ? 'Cadastros / ' : ''}${label}`;
  for (const link of root.querySelectorAll('.sidebar a[href]')) {
    const target = key === 'cadastros' ? `#cadastros/${child}` : `#${key}`;
    const active = link.getAttribute('href') === target;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const group = root.querySelector('.nav-group-toggle');
  group?.classList.toggle('active', key === 'cadastros');
  group?.setAttribute('aria-expanded', String(cadastrosOpen));
  const children = root.querySelector('#cadastros-subnav');
  if (children) children.hidden = !cadastrosOpen;
}
const renderNavigationItem = (slug, key, child) => {
  const m = modules[slug];
  return m.children
    ? `<div class="nav-group"><button aria-label="${m.label}" title="${m.label}" class="nav-item nav-group-toggle ${key === slug ? 'active' : ''}" aria-expanded="${cadastrosOpen}" aria-controls="cadastros-subnav">${icon(slug)}<span>${m.label}</span><span class="nav-chevron" aria-hidden="true">⌄</span></button><div id="cadastros-subnav" class="nav-children" ${cadastrosOpen ? '' : 'hidden'}>${Object.entries(
        m.children,
      )
        .map(
          ([sub, c]) =>
            `<a href="#cadastros/${sub}" class="nav-child ${key === slug && child === sub ? 'active' : ''}" ${key === slug && child === sub ? 'aria-current="page"' : ''}>${c.label}</a>`,
        )
        .join('')}</div></div>`
    : `<a href="#${slug}" aria-label="${m.label}" title="${m.label}" class="nav-item ${key === slug ? 'active' : ''}" ${key === slug ? 'aria-current="page"' : ''}>${icon(slug)}<span>${m.label}</span></a>`;
};
const renderNavigation = (key, child) =>
  navigationSections
    .map((section) => {
      const allowed = getDataContext()?.company?.modules;
      const links = section.items
        .filter((slug) => !allowed || allowed.includes(slug))
        .map((slug) => renderNavigationItem(slug, key, child))
        .join('');
      if (!links) return '';
      return section.label
        ? `<div class="nav-section" role="group" aria-labelledby="nav-section-${section.id}"><h2 class="nav-section-title" id="nav-section-${section.id}">${section.label}</h2>${links}</div>`
        : links;
    })
    .join('');
export async function renderShell(root, onExit) {
  const key = resolveRoute(location.hash);
  const child = resolveCadastro(location.hash);
  if (key === 'cadastros') cadastrosOpen = true;
  const activeModule = key === 'cadastros' ? modules.cadastros.children[child] : modules[key];
  const context = getDataContext();
  const route = { href: location.hash, activeModule, allowed: !context?.company?.modules || context.company.modules.includes(key) };
  const identity = JSON.stringify([context?.companyId, context?.user?.id, context?.company, context?.user?.email]);
  if (mountedShell?.root === root && mountedShell.identity === identity && root.querySelector('.workspace')) {
    mountedShell.closeDrawer();
    updateNavigation(root, key, child, activeModule.label);
    return routeNavigation.open(root, route);
  }
  routeNavigation.reset();
  unsubscribeConnection?.();
  controller?.abort();
  controller = new AbortController();
  document.body.style.overflow = '';
  root.innerHTML = `<div class="workspace${sidebarCollapsed ? ' sidebar-collapsed' : ''}"><button class="nav-backdrop" type="button" tabindex="-1" aria-label="Fechar menu" hidden></button><aside id="workspace-sidebar" class="sidebar"><button class="drawer-close" type="button" aria-label="Fechar menu">×</button>${logo()}<span class="sidebar-monogram" aria-hidden="true">SP</span><div class="nav-caption">SEU SUPERMERCADO</div><nav aria-label="Módulos do sistema">${renderNavigation(key, child)}</nav><div class="sidebar-bottom"><button class="logout" aria-label="Sair" title="Sair">${icon('exit')}<span>Sair</span></button></div></aside><div class="workspace-main"><header class="topbar"><div class="breadcrumb"><button class="sidebar-toggle" type="button" aria-controls="workspace-sidebar">${icon('arrow')}</button><button class="menu-toggle" aria-label="Abrir menu" aria-expanded="false">${icon('menu')}</button><span class="breadcrumb-brand">Gestão da loja</span><b>/</b><strong>${key === 'cadastros' ? 'Cadastros / ' : ''}${activeModule.label}</strong></div><div class="account"><span class="avatar">SP</span><div><strong>${escapeHtml(context?.company?.name || 'Supermercado do Povo')}</strong><span>${escapeHtml(context?.user?.email || 'Equipe autorizada')}</span></div></div></header><button class="skip-link" type="button">Pular para o conteúdo</button><main id="content" tabindex="-1" aria-label="Conteúdo do módulo"><p role="status">Carregando módulo…</p></main><footer class="workspace-footer"><span>Supermercado do Povo</span><span class="sync-status" role="status"></span></footer></div></div>`;
  unsubscribeConnection = subscribeConnection(({ status }) => {
    const indicator = root.querySelector('.sync-status');
    if (indicator)
      indicator.textContent =
        status === 'connected'
          ? 'Atualizações em tempo real ativas'
          : status === 'reconnecting'
            ? 'Reconectando atualizações…'
            : 'Conectando atualizações…';
  });
  const workspace = root.querySelector('.workspace');
  const collapseToggle = root.querySelector('.sidebar-toggle');
  const setSidebarCollapsed = (collapsed) => {
    sidebarCollapsed = collapsed;
    workspace.classList.toggle('sidebar-collapsed', collapsed);
    const label = collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
    collapseToggle.setAttribute('aria-expanded', String(!collapsed));
    collapseToggle.setAttribute('aria-label', label);
    collapseToggle.title = label;
    if (collapsed) {
      cadastrosOpen = false;
      root.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded', 'false');
      const children = root.querySelector('#cadastros-subnav');
      if (children) children.hidden = true;
    }
  };
  setSidebarCollapsed(sidebarCollapsed);
  collapseToggle.onclick = () => setSidebarCollapsed(!sidebarCollapsed);
  const groupToggle = root.querySelector('.nav-group-toggle');
  if (groupToggle) groupToggle.onclick = () => {
    if (sidebarCollapsed && window.matchMedia('(min-width:761px)').matches) {
      setSidebarCollapsed(false);
      cadastrosOpen = true;
    } else {
      cadastrosOpen = !cadastrosOpen;
    }
    groupToggle.setAttribute('aria-expanded', String(cadastrosOpen));
    root.querySelector('#cadastros-subnav').hidden = !cadastrosOpen;
  };
  root.querySelector('.skip-link').onclick = () => root.querySelector('#content').focus();
  const toggle = root.querySelector('.menu-toggle'),
    sidebar = root.querySelector('.sidebar'),
    backdrop = root.querySelector('.nav-backdrop'),
    mobile = window.matchMedia('(max-width:760px)');
  const setDrawer = (open, restore = true) => {
    sidebar.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    backdrop.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      sidebar.setAttribute('aria-label', 'Menu de navegação');
      root.querySelector('.drawer-close').focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      sidebar.removeAttribute('aria-label');
      if (restore) toggle.focus();
    }
  };
  let logoutPending = false;
  root.querySelector('.logout').onclick = async () => {
    if (logoutPending) return;
    logoutPending = true;
    const signal = controller.signal;
    const drawerWasOpen = mobile.matches && sidebar.classList.contains('open');
    if (drawerWasOpen) setDrawer(false, false);
    const confirmed = await confirmLogout({ host: root, signal });
    logoutPending = false;
    if (signal.aborted) return;
    if (confirmed) {
      document.body.style.overflow = '';
      try {
        await onExit();
        controller.abort();
      } catch (error) {
        const status = root.querySelector('.sync-status');
        if (status) status.textContent = 'Não foi possível sair: ' + error.message;
      }
    } else {
      if (drawerWasOpen && mobile.matches) setDrawer(true, false);
      const logout = root.querySelector('.logout');
      (mobile.matches && !sidebar.classList.contains('open') ? toggle : logout).focus();
    }
  };
  toggle.onclick = () => setDrawer(!sidebar.classList.contains('open'));
  backdrop.onclick = () => setDrawer(false);
  root.querySelector('.drawer-close').onclick = () => setDrawer(false);
  document.addEventListener(
    'keydown',
    (event) => {
      if (!mobile.matches || !sidebar.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawer(false);
      }
      if (event.key === 'Tab') {
        const focusables = [...sidebar.querySelectorAll('a[href],button')].filter((el) => el.getClientRects().length);
        const first = focusables[0],
          last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    { signal: controller.signal },
  );
  sidebar.querySelectorAll('a[href]').forEach((link) =>
    link.addEventListener(
      'click',
      () => {
        if (mobile.matches) setDrawer(false);
      },
      { signal: controller.signal },
    ),
  );
  mobile.addEventListener('change', () => setDrawer(false, false), { signal: controller.signal });
  mountedShell = { root, identity, closeDrawer: () => setDrawer(false, false) };
  await routeNavigation.open(root, route);
}
