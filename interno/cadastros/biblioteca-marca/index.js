import { watchBrandLibrary } from "./realtime.js";
import { bindFormDialog } from "../../../shared/form-dialog.js";
import { getDataContext, subscribeResource } from "../remote.js";
import { heading, escapeHtml } from "../../../shared/ui.js";
import { UNCATEGORIZED, assetFromFile, filterAssets } from "./state.js";
import { listAssets, listCategories, addAsset, updateAsset, deleteAsset, getAsset } from "./storage.js";
import { reconcileAssetGrid, assetMetadata } from "./asset-grid.js";
import { mountAssetPreviews } from "./previews.js";
import { mountCategories, categoryOptions } from "./categories.js";
export { listAssets } from "./storage.js";
export async function render(root) {
  root.innerHTML = `<link rel="stylesheet" href="./interno/cadastros/catalog.css"><link rel="stylesheet" href="./interno/cadastros/biblioteca-marca/styles.css"><section class="brand-library"><header class="brand-library-heading">${heading("CADASTROS", "Biblioteca")}<div class="brand-toolbar"><div class="brand-category-manager"></div></div></header><form class="card brand-upload"><label>Categoria dos novos arquivos<select name="category"></select></label><label class="brand-file">Adicionar PNGs<input name="files" type="file" accept="image/png,.png" multiple required></label><p>Selecione vários arquivos. Até 8 MB e 20 megapixels por PNG.</p><button class="button primary" type="submit">Salvar PNGs na biblioteca</button></form><div class="brand-filters"><label>Buscar elemento<input class="brand-query" type="search" placeholder="Nome do elemento"></label><label>Categoria<select class="brand-category"><option value="">Todas as categorias</option></select></label></div><p class="brand-status" role="status" aria-live="polite"></p><nav class="brand-folder-bar" aria-label="Pasta atual"><button class="button secondary brand-back-folders" type="button">← Pastas</button><strong class="brand-current-folder">Todas as pastas</strong><button class="button secondary brand-show-all" type="button">Ver todos os PNGs</button></nav><p class="brand-count" role="status" aria-live="polite"></p><section class="brand-folder-grid" aria-label="Pastas da biblioteca"></section><section class="brand-grid" aria-label="Elementos da biblioteca"></section><dialog class="brand-dialog" aria-label="Editar elemento"><form><h2>Editar elemento</h2><p class="brand-edit-status" role="status" aria-live="polite"></p><label>Nome<input name="name" maxlength="100" required></label><label>Categoria<select name="category"></select></label><div><button type="submit" class="button primary">Salvar</button><button type="button" class="button secondary brand-cancel">Cancelar</button></div></form></dialog><dialog class="brand-delete-dialog" aria-label="Excluir elemento"><h2>Excluir elemento?</h2><p class="brand-delete-name"></p><p>Artes que já guardaram uma cópia deste elemento continuam intactas.</p><button class="button primary brand-confirm-delete">Excluir da biblioteca</button><button class="button secondary brand-cancel-delete">Cancelar</button></dialog></section>`;
  const pendingDeletes = new Set();
  let assets = [],
    categories = [],
    editingAsset = null,
    deletingAsset = null,
    busy = false,
    viewAll = false,
    previewCleanup = null,
    drawVersion = 0,
    drawSignature = "",
    refreshVersion = 0,
    active = true,
    observer,
    stopLibrary,
    stopContext,
    manager;
  const q = (s) => root.querySelector(s),
    library = q(".brand-library");
  const scope = () => {
      const context = getDataContext();
      return JSON.stringify([context?.companyId, context?.user?.id]);
    },
    initialScope = scope();
  const current = () => active && root.isConnected && q(".brand-library") === library && scope() === initialScope;
  const status = (text) => {
    if (current()) q(".brand-status").textContent = text;
  };
  const ensureCurrent = () => {
    if (!current()) throw Error("A sessão ou empresa mudou. Abra a biblioteca novamente.");
  };
  const dialog = q(".brand-dialog"),
    form = dialog.querySelector("form"),
    deleteDialog = q(".brand-delete-dialog");
  const cleanup = (clear = false) => {
    if (!active) return;
    active = false;
    drawVersion++;
    refreshVersion++;
    previewCleanup?.();
    manager?.dispose();
    stopLibrary?.();
    stopContext?.();
    observer?.disconnect();
    assets = [];
    categories = [];
    editingAsset = deletingAsset = null;
    if (dialog.open) dialog.close();
    if (deleteDialog.open) deleteDialog.close();
    if (clear && library.isConnected) library.replaceChildren();
  };
  stopContext = subscribeResource("brand_assets", () => {
    if (!getDataContext() || scope() !== initialScope) cleanup(true);
  });
  observer = new MutationObserver(() => {
    if (!current()) cleanup(scope() !== initialScope);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  function draw() {
    if (!current()) return;

    const category = q(".brand-category").value,
      query = q(".brand-query").value;
    const showFolders = !category && !query.trim() && !viewAll;
    const rows = filterAssets(assets, query, category);
    const signature = JSON.stringify([
      category,
      query,
      viewAll,
      categories,
      rows.map((asset) => [asset.id, asset._version, asset.name, asset.category, asset.width, asset.height]),
    ]);
    if (signature === drawSignature) return;
    drawSignature = signature;
    previewCleanup?.();
    previewCleanup = null;
    const version = ++drawVersion;
    q(".brand-current-folder").textContent = category || (!showFolders ? "Todos os PNGs" : "Todas as pastas");
    q(".brand-back-folders").hidden = showFolders;
    q(".brand-show-all").hidden = !showFolders;
    q(".brand-folder-grid").hidden = !showFolders;
    q(".brand-grid").hidden = showFolders;
    q(".brand-count").textContent = showFolders
      ? `${categories.length} pasta(s) · ${assets.length} PNG(s)`
      : `${rows.length} elemento(s)`;
    q(".brand-folder-grid").innerHTML = showFolders
      ? categories
          .map(
            (name) =>
              `<button class="brand-folder" type="button" data-folder="${escapeHtml(name)}"><span class="brand-folder-icon" aria-hidden="true">▰</span><span><strong>${escapeHtml(name)}</strong><small>${assets.filter((asset) => asset.category === name).length} PNG(s)</small></span><span class="brand-folder-arrow" aria-hidden="true">→</span></button>`,
          )
          .join("")
      : "";
    root.querySelectorAll("[data-folder]").forEach(
      (button) =>
        (button.onclick = () => {
          viewAll = false;
          q(".brand-category").value = button.dataset.folder;
          draw();
          q(".brand-query").focus();
        }),
    );
    if (showFolders) q(".brand-grid").replaceChildren();
    else reconcileAssetGrid(q(".brand-grid"), rows);
    if (!showFolders)
      previewCleanup = mountAssetPreviews(q(".brand-grid"), rows, {
        isCurrent: () => current() && version === drawVersion,
        onError: (error) => status(error.message),
      });
    root.querySelectorAll(".brand-download").forEach(
      (button) =>
        (button.onclick = async () => {
          if (!current() || button.disabled) return;
          const asset = assets.find((asset) => asset.id === button.dataset.id);
          if (!asset) return;
          button.disabled = true;
          try {
            const full = await getAsset(asset.id, asset._version);
            if (!current() || version !== drawVersion) return;
            const link = document.createElement("a");
            link.href = full.dataURL;
            link.download = asset.name.replace(/[\\/:*?"<>|]/g, "-") + ".png";
            document.body.append(link);
            link.click();
            link.remove();
          } catch (error) {
            if (current() && version === drawVersion) status(error.message);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        }),
    );
    root.querySelectorAll(".brand-edit").forEach(
      (button) =>
        (button.onclick = () => {
          if (!current()) return;
          const a = assets.find((a) => a.id === button.dataset.id);
          if (!a) return;
          editingAsset = { ...a };
          q(".brand-edit-status").textContent = "";
          form.elements.name.value = a.name;
          form.elements.category.value = a.category;
          dialog.showModal();
          form.elements.name.focus();
        }),
    );
    root.querySelectorAll(".brand-delete").forEach(
      (button) =>
        (button.onclick = () => {
          if (!current()) return;
          const a = assets.find((a) => a.id === button.dataset.id);
          if (!a) return;
          deletingAsset = { ...a };
          q(".brand-delete-name").textContent = a.name;
          deleteDialog.showModal();
          q(".brand-cancel-delete").focus();
        }),
    );
  }
  const uploadForm = q(".brand-upload"),
    uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.className = "button primary";
  uploadButton.textContent = "+ Adicionar PNGs";
  q(".brand-toolbar").append(uploadButton);
  const uploadModal = bindFormDialog(uploadForm, {
    host: root,
    title: "Adicionar PNGs à biblioteca",
    resource: "brand_assets",
    errorSource: q(".brand-status"),
  });
  uploadButton.onclick = () => uploadModal.open();
  manager = mountCategories(q(".brand-category-manager"), {
    getCategories: () => categories,
    getAssets: () => assets,
    onChange: () => refresh(),
  });
  const refresh = async () => {
    if (!current()) return;
    const version = ++refreshVersion;
    const [nextAssets, nextCategories] = await Promise.all([listAssets(), listCategories()]);
    if (!current() || version !== refreshVersion) return;
    assets = nextAssets.filter((asset) => !pendingDeletes.has(asset.id));
    categories = nextCategories;
    const uploadSelect = q(".brand-upload").elements.category,
      filterSelect = q(".brand-category");
    const selectedUpload = categories.includes(uploadSelect.value) ? uploadSelect.value : UNCATEGORIZED;
    const selectedFilter = categories.includes(filterSelect.value) ? filterSelect.value : "";
    uploadSelect.innerHTML = categoryOptions(categories, selectedUpload);
    filterSelect.innerHTML =
      '<option value="">Todas as categorias</option>' + categoryOptions(categories, selectedFilter);
    // A metadata refresh must not change the category/version of an open edit.
    const editCategory = dialog.open ? form.elements.category.value : "";
    form.elements.category.innerHTML = categoryOptions(
      editCategory && !categories.includes(editCategory) ? [...categories, editCategory] : categories,
      editCategory,
    );
    manager.draw();
    draw();
  };
  q(".brand-query").oninput = draw;
  q(".brand-category").onchange = () => {
    viewAll = false;
    draw();
  };
  q(".brand-back-folders").onclick = () => {
    viewAll = false;
    q(".brand-category").value = "";
    q(".brand-query").value = "";
    draw();
  };
  q(".brand-show-all").onclick = () => {
    viewAll = true;
    draw();
  };
  q(".brand-cancel").onclick = () => dialog.close();
  q(".brand-cancel-delete").onclick = () => deleteDialog.close();
  q(".brand-upload").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !current()) return;
    busy = true;
    const upload = event.currentTarget,
      button = upload.querySelector("[type=submit]"),
      files = [...upload.elements.files.files],
      category = upload.elements.category.value;
    button.disabled = true;
    let saved = 0;
    const errors = [];
    try {
      for (const file of files) {
        ensureCurrent();
        status(`Salvando ${saved + errors.length + 1} de ${files.length}…`);
        try {
          const asset = await assetFromFile(file, category);
          ensureCurrent();
          const added = await addAsset(asset);
          ensureCurrent();
          refreshVersion++;
          assets = [assetMetadata(added), ...assets.filter((entry) => entry.id !== added.id)];
          saved++;
        } catch (error) {
          if (!current()) throw error;
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      ensureCurrent();
      q(".brand-category").value = category;
      viewAll = false;
      manager.draw();
      draw();
      ensureCurrent();
      if (saved === files.length) {
        upload.elements.files.value = "";
        uploadModal.close();
      }
      status(
        `${saved} PNG(s) salvo(s).${errors.length ? " " + errors.join(" | ") : " Disponíveis no editor de encartes."}`,
      );
    } catch (error) {
      status(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled || !current()) return;
    button.disabled = true;
    try {
      if (!editingAsset) throw new Error("Elemento não encontrado.");
      const updated = await updateAsset({ ...editingAsset, name: form.elements.name.value, category: form.elements.category.value });
      ensureCurrent();
      refreshVersion++;
      assets = assets.map((asset) => asset.id === updated.id ? assetMetadata(updated) : asset);
      dialog.close();
      manager.draw();
      draw();
      status("Elemento atualizado.");
    } catch (error) {
      if (current()) q(".brand-edit-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  q(".brand-confirm-delete").onclick = async () => {
    const button = q(".brand-confirm-delete");
    if (button.disabled || !current() || !deletingAsset) return;
    const removed = deletingAsset, index = assets.findIndex((asset) => asset.id === removed.id);
    button.disabled = true;
    pendingDeletes.add(removed.id);
    refreshVersion++;
    assets = assets.filter((asset) => asset.id !== removed.id);
    deleteDialog.close();
    manager.draw();
    draw();
    status("Excluindo elemento…");
    try {
      await deleteAsset(removed.id, removed._version);
      ensureCurrent();
      refreshVersion++;
      status("Elemento excluído da biblioteca.");
    } catch (error) {
      if (current()) {
        refreshVersion++;
        if (!assets.some((asset) => asset.id === removed.id)) assets.splice(Math.max(0, index), 0, removed);
        manager.draw();
        draw();
        status(error.message);
      }
    } finally {
      pendingDeletes.delete(removed.id);
      button.disabled = false;
    }
  };
  try {
    await refresh();
    if (current()) {
      stopLibrary = watchBrandLibrary(root, refresh);
    }
  } catch (error) {
    status(error.message);
    draw();
  }
}
