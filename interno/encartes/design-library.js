import { escapeHtml } from '../../shared/ui.js';
import { getDataContext } from '../../shared/data/api.js';
import { listDesignSummaries, getDesign, deleteDesign } from './storage.js';
import { renderDesign } from './renderer.js';
import { publicationFromId } from './publication.js';
import { isFlyerModel } from './modelos/model.js';

// A mutation and its Realtime signal share one refresh; a stale list cannot
// reinsert a card that was successfully deleted in the meantime.
export function createDesignLibraryController({
  list,
  remove,
  onRows = () => {},
  onError = () => {},
  isCurrent = () => true,
}) {
  let rows = [],
    request = null,
    refreshAgain = false,
    mutations = 0,
    disposed = false;
  const deleted = new Set();
  const current = () => !disposed && isCurrent();
  const notify = () => {
    if (current()) onRows(rows);
  };
  const refresh = () => {
    if (!current()) return Promise.resolve();
    if (request || mutations) {
      refreshAgain = true;
      return request || Promise.resolve();
    }
    request = (async () => {
      do {
        refreshAgain = false;
        try {
          const next = await list();
          if (!current()) return;
          rows = next.filter((row) => !deleted.has(row.id));
          notify();
        } catch (error) {
          if (current()) onError(error);
        }
      } while (current() && refreshAgain && !mutations);
    })().finally(() => {
      request = null;
    });
    return request;
  };
  return {
    refresh,
    async remove(row) {
      if (!current() || deleted.has(row.id)) return;
      mutations++;
      try {
        await remove(row);
        if (!current()) return;
        deleted.add(row.id);
        rows = rows.filter((item) => item.id !== row.id);
        notify();
      } finally {
        mutations--;
        if (current() && !mutations && refreshAgain) void refresh();
      }
    },
    dispose() {
      disposed = true;
    },
  };
}

export function renderDesignLibrary(
  root,
  {
    status,
    onOpen,
    onDuplicate,
    onDeleted,
    onError = () => {},
    beforeDelete = async () => {},
    list = async () => (await listDesignSummaries()).filter(row => !row.publication && !publicationFromId(row.id) && !isFlyerModel(row)),
    read = getDesign,
    remove = deleteDesign,
  } = {},
) {
  const context = getDataContext(),
    company = context?.companyId,
    user = context?.user?.id;
  let active = true,
    previewActive = 0,
    dialog = null;
  const entries = new Map(),
    previewQueue = [];
  root.innerHTML =
    (status === 'draft'
      ? '<p class="flyer-help">Rascunhos são excluídos automaticamente após 15 dias sem alterações.</p>'
      : '') +
    '<p class="flyer-library-state flyer-help" role="status" aria-live="polite">Carregando artes…</p><div class="flyer-gallery"></div>';
  const grid = root.querySelector('.flyer-gallery'),
    state = root.querySelector('.flyer-library-state');
  const current = () =>
    active && root.isConnected && getDataContext()?.companyId === company && getDataContext()?.user?.id === user;
  const showError = (error) => {
    if (!current()) return;
    state.textContent = error.message;
    onError(error);
  };
  const drain = () => {
    while (current() && previewActive < 2 && previewQueue.length) {
      const entry = previewQueue.shift();
      entry.queued = false;
      if (
        !entry.node.isConnected ||
        entry.renderedVersion === entry.row._version ||
        entry.loadingVersion === entry.row._version
      )
        continue;
      const version = entry.row._version;
      entry.loadingVersion = version;
      previewActive++;
      void (async () => {
        try {
          const design = await read(entry.row.id, { preview: true, expectedVersion: version });
          if (!current() || !entry.node.isConnected || entry.row._version !== version) return;
          const scratch = document.createElement('canvas');
          await renderDesign(scratch, design, { scale: 260 / Math.max(design.width, design.height) });
          if (!current() || !entry.node.isConnected || entry.row._version !== version) return;
          entry.canvas.width = scratch.width;
          entry.canvas.height = scratch.height;
          entry.canvas.getContext('2d').drawImage(scratch, 0, 0);
          entry.renderedVersion = version;
          entry.canvas.setAttribute('aria-label', 'Prévia de ' + entry.row.title);
        } catch (error) {
          if (current() && entry.node.isConnected) {
            entry.canvas.setAttribute('aria-label', 'Prévia indisponível');
            entry.canvas.title = 'Prévia indisponível. Abra a arte para tentar novamente.';
          }
        } finally {
          if (entry.loadingVersion === version) entry.loadingVersion = null;
          previewActive--;
          drain();
        }
      })();
    }
  };
  const queue = (entry) => {
    if (entry.queued) return;
    entry.queued = true;
    previewQueue.push(entry);
    drain();
  };
  const observer = new IntersectionObserver(
    (items) => {
      for (const item of items) {
        const entry = entries.get(item.target.dataset.id);
        if (!entry) continue;
        entry.visible = item.isIntersecting;
        if (item.isIntersecting) queue(entry);
      }
    },
    { rootMargin: '160px' },
  );
  const setBusy = (entry, value) =>
    entry.node.querySelectorAll('button').forEach((button) => (button.disabled = value));
  const confirmDelete = (entry) => {
    dialog?.close();
    const row = { ...entry.row };
    dialog = document.createElement('dialog');
    dialog.className = 'flyer-confirm';
    dialog.setAttribute('aria-label', 'Excluir arte');
    dialog.innerHTML = `<h2>Excluir esta arte?</h2><p>${escapeHtml(row.title)}</p><p role="status" aria-live="polite"></p><div><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-delete>Excluir</button></div>`;
    document.body.append(dialog);
    const opened = dialog;
    opened.querySelector('[data-cancel]').onclick = () => opened.close();
    opened.addEventListener(
      'close',
      () => {
        opened.remove();
        if (dialog === opened) dialog = null;
      },
      { once: true },
    );
    opened.querySelector('[data-delete]').onclick = async () => {
      const button = opened.querySelector('[data-delete]');
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Excluindo…';
      setBusy(entry, true);
      try {
        await beforeDelete(row);
        await controller.remove(row);
        if (current()) opened.close();
      } catch (error) {
        if (current() && opened.isConnected) {
          opened.querySelector('[role=status]').textContent = error.message;
          button.disabled = false;
          button.textContent = 'Excluir';
        }
      } finally {
        if (entry.node.isConnected) setBusy(entry, false);
      }
    };
    opened.showModal();
    opened.querySelector('[data-cancel]').focus();
  };
  const reconcile = (all) => {
    if (!current()) return;
    const rows = all.filter((row) => row.status === status),
      ids = new Set(rows.map((row) => row.id));
    for (const [id, entry] of entries)
      if (!ids.has(id)) {
        observer.unobserve(entry.node);
        entry.node.remove();
        entries.delete(id);
      }
    const empty = grid.querySelector('.flyer-empty-library');
    if (rows.length) empty?.remove();
    for (const [position, row] of rows.entries()) {
      let entry = entries.get(row.id);
      if (!entry) {
        const node = document.createElement('article');
        node.className = 'card flyer-gallery-card';
        node.dataset.id = row.id;
        node.innerHTML =
          '<button type="button" class="flyer-open-design"><canvas role="img" aria-label="Carregando prévia"></canvas><strong></strong><span></span></button><div><button type="button" class="button secondary flyer-duplicate-design">Duplicar</button><button type="button" class="button secondary flyer-delete-design">Excluir</button></div>';
        entry = {
          node,
          canvas: node.querySelector('canvas'),
          row,
          renderedVersion: null,
          queued: false,
          visible: false,
        };
        entries.set(row.id, entry);
        grid.append(node);
        observer.observe(node);
        node.querySelector('.flyer-open-design').onclick = async () => {
          setBusy(entry, true);
          try {
            await onOpen(entry.row);
          } catch (error) {
            showError(error);
          } finally {
            if (current() && node.isConnected) setBusy(entry, false);
          }
        };
        node.querySelector('.flyer-duplicate-design').onclick = async () => {
          setBusy(entry, true);
          try {
            await onDuplicate(entry.row);
          } catch (error) {
            showError(error);
          } finally {
            if (current() && node.isConnected) setBusy(entry, false);
          }
        };
        node.querySelector('.flyer-delete-design').onclick = () => confirmDelete(entry);
      }
      if (grid.children[position] !== entry.node) grid.insertBefore(entry.node, grid.children[position] || null);
      const changed = entry.row._version !== row._version;
      entry.row = row;
      entry.node.querySelector('strong').textContent = row.title;
      entry.node.querySelector('.flyer-open-design>span').textContent = `${row.width} × ${row.height} px`;
      if (changed && entry.visible) queue(entry);
    }
    if (!rows.length && !grid.querySelector('.flyer-empty-library')) {
      const card = document.createElement('section');
      card.className = 'card flyer-empty-library';
      card.innerHTML = `<h2>${status === 'draft' ? 'Nenhum rascunho ainda.' : 'Suas artes concluídas aparecerão aqui.'}</h2><p>Comece uma arte em branco ou escolha um cenário na Galeria.</p>`;
      grid.append(card);
    }
    state.textContent = '';
  };
  const controller = createDesignLibraryController({
    list,
    remove: async (row) => {
      await remove(row.id, { expectedVersion: row._version });
      if (current()) onDeleted?.(row);
    },
    onRows: reconcile,
    onError: showError,
    isCurrent: current,
  });
  void controller.refresh();
  return {
    refresh: controller.refresh,
    dispose() {
      if (!active) return;
      active = false;
      observer.disconnect();
      controller.dispose();
      dialog?.close();
      dialog?.remove();
      dialog = null;
      previewQueue.length = 0;
    },
  };
}
