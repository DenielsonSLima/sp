import { installCustomSelects } from './components/custom-select/index.js';
import { renderLogin } from '../login/login.js';
import { renderShell, disposeShell } from '../interno/shell.js';
import { signIn, restoreSession, signOut, onAuthChange } from './data/auth.js';
import { getDataContext, loadContext } from './data/api.js';
const app = document.querySelector('#app');
installCustomSelects(app);
let rendering = 0;
async function render() {
  const id = ++rendering;
  if (!getDataContext()) {
    disposeShell();
    return renderLogin(app, async (credentials) => {
      await signIn(credentials);
      await render();
    });
  }
  try {
    await renderShell(app, async () => {
      await signOut();
      await render();
    });
  } catch (error) {
    if (id === rendering) {
      app.textContent = 'Não foi possível carregar sua empresa. Recarregue a página.';
      console.error(error);
    }
  }
}
window.addEventListener('hashchange', () => void render());
window.addEventListener('sp:access-changed', () => void render());
onAuthChange(async (event) => {
  if (event === 'SIGNED_OUT') await render();
  if (event === 'SIGNED_IN' && !getDataContext()) {
    try {
      await loadContext();
      await render();
    } catch (error) {
      renderLogin(
        app,
        async (credentials) => {
          await signIn(credentials);
          await render();
        },
        { message: error.message },
      );
    }
  }
});
app.innerHTML = '<main class="auth-loading" role="status">Conectando ao Supermercado do Povo…</main>';
try {
  await restoreSession();
  await render();
} catch (error) {
  renderLogin(
    app,
    async (credentials) => {
      await signIn(credentials);
      await render();
    },
    { message: error.message },
  );
}
