import { getDataContext } from "../remote.js";
import { bindUppercaseInput } from "../../../shared/components/uppercase-input.js";
import { watchProductChanges } from "./realtime.js";
import { loadProductDetail } from "./queries.js";
import { heading, escapeHtml as esc } from "../../../shared/ui.js";
import { icon } from "../../../shared/icons.js";
import { productRepository as repository } from "./services.js";
import { readPhotoBatch, movePhoto, isPhotoSource, refreshGallerySources } from "./photo.js";
import { productHref } from "./navigation.js";
import { productCategories, productSubcategories } from "../categorias/queries.js";
import { drafts } from "./drafts.js";
import { css, fields, options, photoMarkup } from "./view.js";
export async function renderDetail(root, id, filters) {
  root.innerHTML = `${css}<a class="product-back" href="${esc(productHref("", filters))}">← Voltar para produtos</a><p role="status">Carregando produto...</p>`;
  let product;
  const pendingDraft = drafts.get(id);
  try {
    product =
      id === "novo" && !pendingDraft?._savedProductId
        ? { name: "", category: "", unit: "", photos: [] }
        : await loadProductDetail(pendingDraft?._savedProductId ?? id);
  } catch (error) {
    root.querySelector("[role=status]").textContent = error.message;
    return;
  }
  if (!root.isConnected) return;
  if (!product) {
    root.querySelector("[role=status]").textContent = "Produto não encontrado.";
    return;
  }
  const savedDraft = drafts.get(id),
    freshEntries = product.photoEntries ?? [];
  product = { ...product, ...savedDraft };
  const refreshed = refreshGallerySources(product.photos ?? [], product.photoEntries ?? [], freshEntries);
  product.photoEntries = refreshed.photoEntries;
  product.photos = refreshed.photos;
  let photos = [...(product.photos || (product.photo ? [product.photo] : []))],
    selected = 0,
    busy = false,
    version = 0;
  let isNew = id === "novo" && !product.id,
    editingId = product.id ?? id;
  const companyId = getDataContext()?.companyId;
  root.innerHTML = `${css}<nav class="product-breadcrumb" aria-label="Localização"><a href="${esc(productHref("", filters))}">Produtos</a><span aria-hidden="true">/</span><span>${esc(isNew ? "Novo produto" : product.name)}</span></nav><a class="product-back" href="${esc(productHref("", filters))}">← Voltar para produtos</a>${heading("CADASTROS", isNew ? "Novo produto" : product.name)}<form class="product-detail-form"><div class="product-detail-layout"><section class="card product-gallery" aria-label="Fotos do produto"><div class="product-gallery-heading"><h2>Fotos do produto</h2><span class="photo-count"></span></div><div class="product-hero"></div><div class="product-thumbnails" aria-label="Galeria de fotos"></div><div class="photo-actions"></div><label class="button secondary product-upload">${icon("plus")} Adicionar fotos<input class="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Adicionar fotos do produto"></label><p class="catalog-helper">Até 5 fotos. PNG, JPEG ou WebP, até 3 MB por arquivo. A primeira foto é a principal.</p></section><section class="card product-data"><h2>Dados do produto</h2>${fields(product)}<div class="catalog-form-actions"><button class="button primary save-product" type="submit">${isNew ? "Cadastrar produto" : "Salvar alterações"}</button><a class="button secondary" href="${esc(productHref("", filters))}">Voltar</a></div><p class="catalog-status" role="status" aria-live="polite"></p></section></div></form>`;
  const form = root.querySelector("form"),
    status = (text) => (root.querySelector(".catalog-status").textContent = text);
  bindUppercaseInput(form.elements.name);
  form.elements.category.addEventListener("change", () => {
    form.elements.subcategoryId.innerHTML =
      '<option value="">Sem subcategoria</option>' +
      options(
        productSubcategories
          .filter(
            (row) =>
              productCategories.find((parent) => parent.id === row.parentId)?.name === form.elements.category.value,
          )
          .map((row) => ({ value: row.id, label: row.name })),
        "",
      );
  });
  const remember = () => {
    if (!root.isConnected || getDataContext()?.companyId !== companyId) return;
    drafts.set(id, {
      name: form.elements.name.value,
      code: form.elements.code.value,
      category: form.elements.category.value,
      subcategoryId: form.elements.subcategoryId.value,
      unit: form.elements.unit.value,
      photos: [...photos],
      photoEntries: product.photoEntries ?? [],
      _savedProductId: product.id,
      _version: product._version,
    });
  };
  form.addEventListener("input", remember);
  form.addEventListener("change", remember);
  const setBusy = (value) => {
    busy = value;
    form.querySelectorAll("button,input,select").forEach((el) => (el.disabled = value));
  };
  const refresh = () => {
    selected = Math.min(selected, Math.max(0, photos.length - 1));
    root.querySelector(".photo-count").textContent = `${photos.length} / 5`;
    root.querySelector(".product-hero").innerHTML = photoMarkup(photos[selected], product.name || "novo produto");
    root.querySelector(".product-thumbnails").innerHTML = photos
      .map(
        (photo, index) =>
          `<button type="button" class="photo-thumbnail ${index === selected ? "selected" : ""}" data-index="${index}" aria-label="Ver foto ${index + 1}${index === 0 ? ", principal" : ""}" aria-pressed="${index === selected}"><img src="${esc(isPhotoSource(photo) ? photo : "")}" alt=""><span>${index === 0 ? "Principal" : index + 1}</span></button>`,
      )
      .join("");
    root.querySelector(".photo-actions").innerHTML = photos.length
      ? `<button type="button" class="button secondary make-primary" ${selected === 0 ? "disabled" : ""}>Tornar principal</button><button type="button" class="button secondary move-left" aria-label="Mover foto para antes" ${selected === 0 ? "disabled" : ""}>←</button><button type="button" class="button secondary move-right" aria-label="Mover foto para depois" ${selected === photos.length - 1 ? "disabled" : ""}>→</button><button type="button" class="button secondary remove-photo">Remover foto</button>`
      : "";
    root.querySelector(".photo-input").disabled = photos.length >= 5;
    root.querySelector(".product-upload").classList.toggle("is-disabled", photos.length >= 5);
    root.querySelectorAll(".photo-thumbnail").forEach(
      (b) =>
        (b.onclick = () => {
          if (busy) return;
          selected = Number(b.dataset.index);
          refresh();
          root.querySelectorAll(".photo-thumbnail")[selected]?.focus();
        }),
    );
    const reorder = (to) => {
      if (busy) return;
      photos = movePhoto(photos, selected, to);
      selected = to;
      remember();
      refresh();
      status("Ordem atualizada. Salve as alterações para confirmar.");
    };
    root.querySelector(".make-primary")?.addEventListener("click", () => reorder(0));
    root.querySelector(".move-left")?.addEventListener("click", () => reorder(selected - 1));
    root.querySelector(".move-right")?.addEventListener("click", () => reorder(selected + 1));
    root.querySelector(".remove-photo")?.addEventListener("click", () => {
      if (busy) return;
      photos = photos.filter((_, index) => index !== selected);
      remember();
      refresh();
      status("Foto removida da seleção. Salve as alterações para confirmar.");
    });
  };
  root.querySelector(".photo-input").onchange = async (event) => {
    if (busy) return;
    const current = ++version,
      files = Array.from(event.target.files);
    if (!files.length) return;
    setBusy(true);
    status("Preparando fotos...");
    try {
      const next = await readPhotoBatch(files, photos);
      if (current !== version || !root.isConnected) return;
      photos = next;
      remember();
      selected = photos.length - files.length;
      status("Fotos prontas. Salve as alterações para confirmar.");
    } catch (error) {
      if (root.isConnected) status(error.message);
    } finally {
      if (current === version && root.isConnected) {
        setBusy(false);
        event.target.value = "";
        refresh();
      }
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const input = {
      name: form.elements.name.value,
      code: form.elements.code.value,
      category: form.elements.category.value,
      subcategoryId: form.elements.subcategoryId.value,
      unit: form.elements.unit.value,
      photos,
      photoEntries: product.photoEntries ?? [],
      _version: product._version,
    };
    setBusy(true);
    status("Salvando produto...");
    try {
      product = isNew ? await repository.createProduct(input) : await repository.updateProduct(editingId, input);
      photos = [...(product.photos ?? [])];
      drafts.delete(id);
      if (!root.isConnected) return;
      if (id === "novo") {
        location.hash = productHref(product.id, filters);
      } else {
        root.querySelector("h1").textContent = product.name;
        root.querySelector(".product-breadcrumb span:last-child").textContent = product.name;
        status("Produto salvo.");
      }
    } catch (error) {
      if (!root.isConnected || getDataContext()?.companyId !== companyId) return;
      if (error.pendingPhotoEntries) product.photoEntries = error.pendingPhotoEntries;
      if (error.savedProduct) {
        const entries = product.photoEntries;
        product = { ...error.savedProduct, photoEntries: entries };
        isNew = false;
        editingId = product.id;
        root.querySelector(".save-product").textContent = "Salvar alterações";
      }
      remember();
      if (root.isConnected) status(error.message);
    } finally {
      if (root.isConnected) {
        setBusy(false);
        refresh();
      }
    }
  };
  refresh();
  if (!isNew)
    watchProductChanges(root, async () => {
      if (busy) return;
      const fresh = await repository.getProduct(editingId);
      if (!fresh || !root.isConnected) return;
      const renewed = refreshGallerySources(photos, product.photoEntries ?? [], fresh.photoEntries ?? []);
      photos = renewed.photos;
      product.photoEntries = renewed.photoEntries;
      remember();
      refresh();
    });
}
