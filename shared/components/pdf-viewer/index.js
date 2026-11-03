import { escapeHtml as esc } from '../../ui.js';

/** Owns every URL and async result for one PDF viewing session. */
export async function openPdfDialog(host, { title, generate }, trigger) {
  if (typeof generate !== 'function') throw Error('Gerador de PDF inválido.');
  const dialog = document.createElement('dialog');
  dialog.className = 'campaign-pdf-dialog';
  dialog.setAttribute('aria-labelledby', 'campaign-pdf-title');
  dialog.innerHTML = `<header><div><h2 id="campaign-pdf-title">PDF · ${esc(title)}</h2><p class="pdf-status" role="status" aria-live="polite">Preparando os arquivos PDF…</p></div><button type="button" class="button secondary pdf-close" aria-label="Fechar prévia PDF">Fechar</button></header><div class="pdf-tools" hidden><label>Formato<select class="pdf-format" aria-label="Formato do PDF"></select></label><a class="button primary pdf-download">Baixar</a><button type="button" class="button secondary pdf-print">Imprimir</button><a class="button secondary pdf-open" target="_blank" rel="noopener">Abrir PDF em outra aba</a></div><div class="pdf-viewer" aria-busy="true"></div>`;
  host.append(dialog);
  let disposed = false,
    files = [],
    current = null;
  const ownedUrls = [];
  const alive = () => !disposed && host.isConnected && dialog.isConnected && dialog.open;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    dialog.querySelector('.pdf-viewer').replaceChildren();
    for (const url of ownedUrls) URL.revokeObjectURL(url);
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  };
  const observer = new MutationObserver(() => {
    if (!host.isConnected || !dialog.isConnected) dispose();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  dialog.addEventListener('close', dispose, { once: true });
  dialog.querySelector('.pdf-close').onclick = () => dialog.close();
  dialog.showModal();
  dialog.querySelector('.pdf-close').focus();
  const status = (message) => {
    if (alive()) dialog.querySelector('.pdf-status').textContent = message;
  };
  const select = () => {
    if (!alive()) return;
    current = files[Number(dialog.querySelector('.pdf-format').value)];
    if (!current) return;
    const viewer = dialog.querySelector('.pdf-viewer'),
      printButton = dialog.querySelector('.pdf-print');
    printButton.disabled = true;
    viewer.replaceChildren();
    const iframe = document.createElement('iframe');
    iframe.className = 'pdf-native-preview';
    iframe.title = `PDF: ${current.formatLabel}`;
    iframe.src = current.url;
    iframe.addEventListener(
      'load',
      () => {
        if (alive() && viewer.querySelector('iframe') === iframe) printButton.disabled = false;
      },
      { once: true },
    );
    viewer.append(iframe);
    const pages = document.createElement('div');
    pages.className = 'pdf-raster-preview';
    for (const [index, url] of current.previewUrls.entries()) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Página ${index + 1} de ${current.pages} · ${current.formatLabel}`;
      img.loading = 'lazy';
      pages.append(img);
    }
    if (!current.previewUrls.length) {
      const text = document.createElement('p');
      text.textContent = 'Se a prévia não aparecer, use Abrir PDF em outra aba.';
      pages.append(text);
    }
    viewer.append(pages);
    const download = dialog.querySelector('.pdf-download');
    download.href = current.url;
    download.download = current.name;
    dialog.querySelector('.pdf-open').href = current.url;
    status(`${current.formatLabel} · ${current.pages} folha(s). Imprima em escala 100% com o papel indicado.`);
  };
  dialog.querySelector('.pdf-format').onchange = select;
  dialog.querySelector('.pdf-print').onclick = () => {
    if (!alive() || !current || dialog.querySelector('.pdf-print').disabled) return;
    try {
      const frame = dialog.querySelector('iframe');
      frame.contentWindow.focus();
      frame.contentWindow.print();
      status('Se o diálogo de impressão não abrir, abra o PDF em outra aba e use Imprimir no visualizador.');
    } catch {
      status('Abra o PDF em outra aba e use Imprimir no visualizador do navegador.');
    }
  };
  try {
    const results = await generate();
    if (!alive()) return;
    files = results.map((file) => {
      const url = URL.createObjectURL(file.blob);
      ownedUrls.push(url);
      const previewUrls = (file.previewPages || []).map((blob) => {
        const pageUrl = URL.createObjectURL(blob);
        ownedUrls.push(pageUrl);
        return pageUrl;
      });
      return { ...file, url, previewUrls };
    });
    dialog.querySelector('.pdf-format').innerHTML = files
      .map((file, i) => `<option value="${i}">${esc(file.formatLabel)} · ${file.pages} folha(s)</option>`)
      .join('');
    dialog.querySelector('.pdf-tools').hidden = false;
    dialog.querySelector('.pdf-viewer').setAttribute('aria-busy', 'false');
    select();
  } catch (error) {
    if (alive()) {
      status(error.message || 'Não foi possível preparar o PDF.');
      dialog.querySelector('.pdf-viewer').setAttribute('aria-busy', 'false');
    }
  }
}
