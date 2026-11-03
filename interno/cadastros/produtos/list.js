import { watchProductCatalog } from "./realtime.js";
import { useProductPage } from "./hooks/use-product-page.js";
import { heading, escapeHtml as esc } from "../../../shared/ui.js";
import { icon } from "../../../shared/icons.js";
import { units, unitLabel } from "../unidades/queries.js";
import { productHref, changeProductList } from "./navigation.js";
import { productCategories, productSubcategories, loadProductCategories } from "../categorias/queries.js";
import { options, photoMarkup, categoryNames } from "./view.js";
import { filterValues } from "../../../shared/filters.js";
import { sortedOptions, subcategoryOptions, selectedValues, allOption } from "./list-filters.js";
export async function renderList(root, initialFilters) {
  let filters = initialFilters;
  const categoryOptions = () => sortedOptions(categoryNames().map((name) => ({ value: name, label: name })));
  const subOptions = () => subcategoryOptions(productCategories, productSubcategories, filters.category);
  root.innerHTML = `<div class="page-heading-actions">${heading("CADASTROS", "Produtos")}<a class="button primary product-new" href="${esc(productHref("novo", filters))}">${icon("plus")} Novo produto</a></div><section class="card catalog-filters product-filters" aria-label="Filtros de produtos"><label>Buscar produto<input type="search" class="search" maxlength="100" value="${esc(filters.query)}" placeholder="Nome ou código do produto..."></label><label>Categoria<select class="category-filter" multiple data-empty-clears="true" data-searchable="true">${allOption("Todas as categorias", filters.category)}${options(
    categoryOptions(),
    filters.category,
  )}</select></label><label>Subcategoria<select class="subcategory-filter" multiple data-empty-clears="true" data-searchable="true">${allOption("Todas as subcategorias", filters.subcategory)}${options(subOptions(), filters.subcategory)}</select></label><button class="button secondary catalog-clear" type="button">Limpar filtros</button></section><div class="product-list-toolbar"><p class="catalog-count" aria-live="polite">Carregando produtos do banco…</p><div class="product-view-toggle module-tabs" role="group" aria-label="Visualização dos produtos"><button type="button" data-view="cards" aria-pressed="${filters.view === "cards"}">Cards</button><button type="button" data-view="table" aria-pressed="${filters.view === "table"}">Tabela</button></div></div><section class="product-results" aria-label="Produtos encontrados"></section><nav class="product-pagination" aria-label="Paginação dos produtos"></nav><p class="catalog-status" role="status"></p>`;
  let version = 0,
    searchTimer,
    renderedSignature = "";
  const pageQuery = useProductPage({ root, isCurrent: () => root.isConnected });
  const results = root.querySelector(".product-results"),
    status = root.querySelector(".catalog-status");
  const photoSources = new WeakMap();
  let retryPreviews = null;
  const photoFailure = "<span><small>Não foi possível carregar a foto.</small></span>";
  const reportPhotoError = (error) => {
    if (!root.isConnected) return;
    status.textContent = "Os dados estão disponíveis, mas algumas fotos não carregaram. " + error.message + " ";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button secondary";
    button.textContent = "Tentar novamente fotos";
    button.onclick = () => {
      status.textContent = "";
      void retryPreviews?.();
    };
    status.append(button);
  };
  results.addEventListener("error", (event) => {
    if (event.target?.tagName !== "IMG") return;
    const node = event.target.closest("[data-product-photo]");
    if (!node || !results.contains(node)) return;
    photoSources.delete(node);
    node.innerHTML = photoFailure;
    reportPhotoError(Error("A imagem não pôde ser exibida."));
  }, true);
  const unit = (p) => esc(units.some((u) => u.id === p.unit) ? unitLabel(p.unit) : p.unitLabel || p.unit);
  const preview = (p) => (p.hasPhotos ? "<span><small>Carregando foto…</small></span>" : photoMarkup("", p.name));
  const list = async ({ focusPage = false } = {}) => {
    const current = ++version,
      isCurrent = () => current === version && root.isConnected;
    results.setAttribute("aria-busy", "true");
    results.inert = true;
    status.textContent = "";
    root
      .querySelectorAll("[data-view]")
      .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === filters.view)));
    try {
      const page = await pageQuery.load(filters),
        slice = page.slice;
      if (!page.isCurrent()) return;
      if (!isCurrent()) return;
      filters.page = slice.page;
      const signature = JSON.stringify([filters, slice]);
      if (signature !== renderedSignature) {
        renderedSignature = signature;
        history.replaceState(null, "", productHref("", filters));
        root.querySelector(".product-new").href = productHref("novo", filters);
        root.querySelector(".catalog-count").textContent = slice.total
          ? `${slice.from}–${slice.to} de ${slice.total} produto(s)${slice.total !== slice.allTotal ? ` · ${slice.allTotal} no catálogo` : ""}`
          : "Nenhum produto encontrado";
        results.tabIndex = filters.view === "table" ? 0 : -1;
        results.className =
          filters.view === "cards" ? "product-results catalog-grid product-grid" : "product-results product-table-wrap";
        results.innerHTML = !slice.total
          ? '<div class="card catalog-empty"><h3>Nenhum produto encontrado.</h3><p>Experimente outro nome ou limpe os filtros.</p></div>'
          : filters.view === "cards"
            ? slice.items
                .map(
                  (p) =>
                    `<a class="card catalog-card product-card product-card-link" href="${esc(productHref(p.id, filters))}" aria-label="Abrir produto ${esc(p.name)}"><div class="product-photo" data-product-photo="${esc(p.id)}">${preview(p)}</div><div class="catalog-card-body"><span class="catalog-category">${esc(p.category)}${p.subcategory ? ` · ${esc(p.subcategory)}` : ""}</span><h3>${esc(p.name)}</h3>${p.code ? `<p class="product-code">Cód. ${esc(p.code)}</p>` : ""}<p class="product-unit">${unit(p)}</p><span class="product-open">Ver produto <span aria-hidden="true">→</span></span></div></a>`,
                )
                .join("")
            : `<p class="product-table-hint">Deslize para o lado para ver todas as colunas.</p><table class="product-table"><caption class="product-sr-only">Produtos encontrados, página ${slice.page} de ${slice.pages}</caption><thead><tr><th scope="col">Foto</th><th scope="col">Produto</th><th scope="col">Código</th><th scope="col">Categoria</th><th scope="col">Subcategoria</th><th scope="col">Unidade</th><th scope="col">Ações</th></tr></thead><tbody>${slice.items.map((p) => `<tr><td class="product-table-photo"><a data-product-photo="${esc(p.id)}" href="${esc(productHref(p.id, filters))}" aria-label="Abrir produto ${esc(p.name)}">${preview(p)}</a></td><th scope="row"><a href="${esc(productHref(p.id, filters))}">${esc(p.name)}</a></th><td class="product-table-code">${p.code ? esc(p.code) : "—"}</td><td>${esc(p.category)}</td><td>${esc(p.subcategory || "—")}</td><td>${unit(p)}</td><td><a class="button secondary" href="${esc(productHref(p.id, filters))}">Ver produto</a></td></tr>`).join("")}</tbody></table>`;
        root.querySelector(".product-pagination").innerHTML =
          `<p>${slice.perPage} por página</p><div class="product-page-controls"><button type="button" class="button secondary" data-page="${slice.page - 1}" ${slice.page === 1 ? "disabled" : ""}>Anterior</button><span tabindex="-1" class="product-page-indicator" aria-live="polite">Página ${slice.page} de ${slice.pages}</span><button type="button" class="button secondary" data-page="${slice.page + 1}" ${slice.page === slice.pages ? "disabled" : ""}>Próxima</button></div>`;
        root.querySelectorAll("[data-page]").forEach(
          (button) =>
            (button.onclick = () => {
              clearTimeout(searchTimer);
              filters.page = Number(button.dataset.page);
              void list({ focusPage: true });
            }),
        );
        results.removeAttribute("aria-busy");
        results.inert = false;
      }
      if (focusPage) root.querySelector(".product-page-indicator").focus({ preventScroll: true });
      const refreshPhotos = () => pageQuery.refreshPreviews(signature, slice.items, {
          onError: (error, rows = []) => {
            if (!root.isConnected || renderedSignature !== signature) return;
            reportPhotoError(error);
            const failed = new Set(rows.map((row) => row.id));
            for (const node of root.querySelectorAll("[data-product-photo]"))
              if (failed.has(node.dataset.productPhoto) && !photoSources.has(node))
                node.innerHTML = photoFailure;
          },
          onBatch: (rows) => {
            if (!root.isConnected) return;
            const byId = new Map(rows.map((row) => [row.id, row]));
            for (const node of root.querySelectorAll("[data-product-photo]")) {
              const row = byId.get(node.dataset.productPhoto);
              if (row && photoSources.get(node) !== row.photo) {
                node.innerHTML = photoMarkup(row.photo, row.name);
                photoSources.set(node, row.photo);
              }
            }
          },
        })
        .catch((error) => {
          if (root.isConnected && renderedSignature === signature) reportPhotoError(error);
        });
      retryPreviews = refreshPhotos;
      void refreshPhotos();
    } catch (error) {
      if (isCurrent()) status.textContent = error.message;
    } finally {
      if (isCurrent()) {
        results.removeAttribute("aria-busy");
        results.inert = false;
      }
    }
  };
  const updateSubcategories = () => {
    const select = root.querySelector(".subcategory-filter");
    select.innerHTML = allOption("Todas as subcategorias", filters.subcategory) + options(subOptions(), filters.subcategory);
  };
  const filterChange = () => {
    clearTimeout(searchTimer);
    filters = changeProductList(filters, {
      query: root.querySelector(".search").value,
      category: selectedValues(root.querySelector(".category-filter")),
      subcategory: selectedValues(root.querySelector(".subcategory-filter")),
    });
    void list();
  };
  root.querySelector(".search").oninput = () => {
    clearTimeout(searchTimer);
    ++version;
    searchTimer = setTimeout(() => {
      if (root.isConnected) filterChange();
    }, 250);
  };
  root.querySelector(".category-filter").onchange = () => {
    filters = changeProductList(filters, { category: selectedValues(root.querySelector(".category-filter")) });
    const available = new Set(subOptions().map((row) => row.value));
    filters = changeProductList(filters, { subcategory: filterValues(filters.subcategory).filter((id) => available.has(id)) });
    updateSubcategories();
    filterChange();
  };
  root.querySelector(".subcategory-filter").onchange = filterChange;
  root.querySelector(".catalog-clear").onclick = () => {
    clearTimeout(searchTimer);
    root.querySelector(".search").value = "";
    root.querySelector(".category-filter").value = "";
    filters = changeProductList(filters, { query: "", category: "", subcategory: "", page: 1 });
    updateSubcategories();
    void list();
    root.querySelector(".search").focus();
  };
  root.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        clearTimeout(searchTimer);
        filters = changeProductList(filters, { view: button.dataset.view, query: root.querySelector(".search").value });
        void list();
      }),
  );
  await list();
  watchProductCatalog(root, async () => {
    await loadProductCategories();
    const categories = filterValues(filters.category).filter((name) => categoryNames().includes(name));
    filters = changeProductList(filters, { category: categories });
    const available = new Set(subOptions().map((row) => row.value));
    filters = changeProductList(filters, { subcategory: filterValues(filters.subcategory).filter((id) => available.has(id)) });
    const select = root.querySelector(".category-filter");
    select.innerHTML = allOption("Todas as categorias", filters.category) + options(categoryOptions(), filters.category);
    updateSubcategories();
    await list();
  });
}
