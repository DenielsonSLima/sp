import {
  planCampaignPdfs,
  renderPosterJpeg,
  createPdfBytes,
  renderPdfPreviewPage,
  MAX_PDF_PAGES,
} from "../promocoes/pdf.js";
import { openPdfDialog } from "../../shared/components/pdf-viewer/index.js";

const MAX_COPIES = 500,
  MAX_OUTPUT_BYTES = 100000000;
const slug = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "modelo";
// Property insertion order is not part of a saved model's identity. Model IDs,
// names, full settings and extra snapshot fields are: never group by paper alone.
const stable = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(stable).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
          .join(",")}}`;

/** Snapshot entries synchronously, validate through the existing poster planner,
 * then pack across validity dates without replacing each offer's own dates. */
export function planPriceTablePdfs(entries) {
  if (!Array.isArray(entries) || !entries.length) throw Error("Selecione produtos enviados para gerar o PDF.");
  let copies = 0;
  for (const entry of entries) {
    if (!entry || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > MAX_COPIES)
      throw Error("Use uma quantidade inteira de 1 a 500 cartazes.");
    copies += entry.quantity;
    if (copies > MAX_COPIES) throw Error("Exporte no máximo 500 cartazes por lote.");
  }
  const groups = new Map();
  let pageCount = 0;
  for (const entry of entries) {
    let snapshot;
    try {
      snapshot = JSON.parse(JSON.stringify(entry.templateSnapshot));
    } catch {
      throw Error("Modelo salvo inválido.");
    }
    const start = entry.start ?? "",
      end = entry.end ?? "",
      omitValidity = start === "" && end === "";
    const [planned] = planCampaignPdfs({
      name: "Tabela de preços",
      start,
      end,
      omitValidity,
      items: [
        {
          name: entry.name,
          unit: entry.unit,
          cents: entry.cents,
          displayName: entry.displayName,
          quantity: 1,
          printLayout: entry.printLayout ?? "individual",
          templateSnapshot: snapshot,
        },
      ],
    });
    const key = stable([snapshot, planned.layout, planned.widthMm, planned.heightMm]);
    if (!groups.has(key)) {
      const sequence = groups.size + 1,
        model = planned.pages[0][0].offer.templateSnapshot;
      groups.set(key, {
        ...planned,
        key,
        modelId: model.id,
        modelName: model.name,
        count: 0,
        pages: [],
        name: `tabela-precos-${slug(model.name)}-${slug(model.id)}-${planned.key}-${sequence}.pdf`,
        formatLabel: `${model.name} · ${planned.formatLabel} · lote ${sequence}`,
      });
    }
    const group = groups.get(key),
      slots = group.layout === "two-a4" ? 2 : 1,
      placement = planned.pages[0][0];
    placement.offer.quantity = entry.quantity;
    placement.offer.omitValidity = omitValidity;
    for (let i = 0; i < entry.quantity; i++) {
      let page = group.pages.at(-1);
      if (!page || page.length === slots) {
        page = [];
        group.pages.push(page);
        if (++pageCount > MAX_PDF_PAGES) throw Error("Exporte no máximo 200 páginas por vez. Divida o lote.");
      }
      const slotWidth = group.widthMm / slots;
      page.push({ ...placement, xMm: page.length * slotWidth + (slotWidth - placement.widthMm) / 2 });
      group.count++;
    }
  }
  return [...groups.values()];
}

/** Uses the same renderer, physical PDF writer and exact-raster preview as
 * promotions. The campaign-wide date API cannot represent these mixed dates. */
export async function generatePriceTablePdfs(entries, { includePreviews = false } = {}) {
  const groups = planPriceTablePdfs(entries),
    results = [];
  let outputBytes = 0;
  const checkBytes = (n) => {
    if (n > MAX_OUTPUT_BYTES) throw Error("Os PDFs e prévias ultrapassam 100 MB. Divida o lote.");
  };
  for (const group of groups) {
    const images = new Map();
    let imageBytes = 0;
    for (const page of group.pages)
      for (const { offer } of page) {
        if (images.has(offer)) continue;
        const image = await renderPosterJpeg(offer);
        imageBytes += image.bytes.length;
        checkBytes(outputBytes + imageBytes);
        images.set(offer, image);
      }
    const bytes = createPdfBytes(group, images);
    outputBytes += bytes.length;
    checkBytes(outputBytes);
    const previewPages = [];
    if (includePreviews)
      for (const page of group.pages) {
        const preview = await renderPdfPreviewPage(group, page, images);
        outputBytes += preview.size;
        checkBytes(outputBytes);
        previewPages.push(preview);
      }
    results.push({
      name: group.name,
      blob: new Blob([bytes], { type: "application/pdf" }),
      pages: group.pages.length,
      formatLabel: group.formatLabel,
      ...(includePreviews ? { previewPages } : {}),
    });
  }
  return results;
}

export function openPriceTablePdfDialog(host, entries, trigger) {
  return openPdfDialog(
    host,
    { title: "Tabela de preços", generate: () => generatePriceTablePdfs(entries, { includePreviews: true }) },
    trigger,
  );
}
