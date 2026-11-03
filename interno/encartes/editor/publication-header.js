/** Keep page editing inside its publication without exposing the artwork library. */
export function bindPublicationHeader(root, { onBack, persist, runtime, message, cleanup }) {
  if (!onBack) return;
  root.querySelector('h1').textContent = 'Editar página do encarte';
  root.querySelector('.flyer-tabs').remove();
  root.querySelector('.flyer-new').hidden = true;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'button secondary flyer-workspace-back';
  back.textContent = '← Voltar ao encarte';
  root.querySelector('.flyer-library-actions').append(back);
  back.onclick = async () => {
    back.disabled = true;
    clearTimeout(runtime.saveTimer);
    if (!(await persist())) { back.disabled = false; return; }
    try {
      await onBack();
      cleanup();
    } catch (error) {
      message(error.message, true);
      back.disabled = false;
    }
  };
}