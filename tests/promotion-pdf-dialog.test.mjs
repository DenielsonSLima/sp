import { readDomainSource, readModuleSource, readModuleStyles } from "./helpers/domain-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
test("PDF opens an accessible native modal with explicit actions and same-file links", async () => {
  const source = await readModuleSource("shared/components/pdf-viewer/index.js");
  for (const text of [
    "document.createElement('dialog')",
    "dialog.showModal()",
    "aria-labelledby",
    'role="status"',
    "Baixar",
    "Imprimir",
    "iframe.src=current.url",
    "download.href=current.url",
    "dialog.querySelector('.pdf-open').href=current.url",
    "dialog.querySelector('.pdf-print').onclick=",
    "frame.contentWindow.print()",
  ])
    assert(source.includes(text), text);
  assert(!source.includes("onload="));
  assert(!source.includes(".click()"));
});
test("PDF owns URLs through close and navigation, guards async completion and restores focus", async () => {
  const source = await readModuleSource("shared/components/pdf-viewer/index.js");
  for (const text of [
    "!disposed&&host.isConnected&&dialog.isConnected&&dialog.open",
    "dialog.addEventListener('close',dispose",
    "if(!host.isConnected||!dialog.isConnected)dispose()",
    "URL.revokeObjectURL(url)",
    "if(!alive())return",
    "if(trigger?.isConnected)trigger.focus()",
    "observer.disconnect()",
  ])
    assert(source.includes(text), text);
});
test("mobile preview uses retained real raster pages and provides native PDF fallback", async () => {
  const source = await readModuleSource("shared/components/pdf-viewer/index.js");
  assert(source.includes("file.previewPages||[]"));
  assert(source.includes("img.src=url"));
  assert(source.includes("Abrir PDF em outra aba"));
  assert(!source.includes("posterMarkup"));
  const css = await readModuleStyles("shared/components/pdf-viewer/styles.css");
  assert(css.includes(".pdf-native-preview{display:none}.pdf-raster-preview{display:grid}"));
  const ui = await readDomainSource("interno/promocoes");
  assert(ui.includes(">PDF</button>"));
  assert(!ui.includes(">Gerar PDFs por formato</button>"));
});

test("printing waits for the current PDF frame to finish loading", async () => {
  const source = await readModuleSource("shared/components/pdf-viewer/index.js");
  assert(source.includes("printButton.disabled=true"));
  assert(source.includes("iframe.addEventListener('load'"));
  assert(source.includes("viewer.querySelector('iframe')===iframe"));
  assert(source.includes("printButton.disabled=false"));
});

test("promotion wrapper retains API and supplies the same PDF generator to reusable viewer", async () => {
  const source = await readModuleSource("interno/promocoes/pdf-dialog.js");
  assert(source.includes("openCampaignPdfDialog(host,campaign,trigger)"));
  assert(source.includes("openPdfDialog(host,{title:campaign.name"));
  assert(source.includes("generateCampaignPdfs(campaign,{includePreviews:true})"));
});
