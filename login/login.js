import { logo } from '../shared/ui.js';
import { icon } from '../shared/icons.js';
export function renderLogin(root, onEnter, { message = '' } = {}) {
  root.innerHTML = `<main class="login-layout"><section class="login-story"><span class="story-tag">SUPERMERCADO DO POVO</span><div><p class="eyebrow">MAIS SIMPLES. MAIS PRÓXIMO.</p><h1>O cuidado de sempre.<br>Uma nova forma<br>de organizar.</h1><p>Seu supermercado, conectado em um só lugar.</p></div><footer><span class="story-dot"></span> Onde o povo faz economia</footer><div class="decor-ring" aria-hidden="true"></div></section><section class="login-panel"><div class="login-box">${logo()}<h2>Bem-vindo de volta.</h2><p>Acesse sua conta para gerenciar o<br>Supermercado do Povo.</p><form class="auth-form"><label>E-mail<input name="email" type="email" autocomplete="username" required placeholder="seu@email.com"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><p class="auth-error" role="alert" aria-live="polite"></p><button class="button primary enter" type="submit"><span>Entrar</span>${icon('arrow')}</button></form><p class="login-footnote">Acesso disponível para a equipe autorizada.</p></div><span class="login-bottom">GESTÃO COM A IDENTIDADE DO POVO</span></section></main>`;
  const form = root.querySelector('form'),
    error = root.querySelector('.auth-error'),
    button = form.querySelector('button');
  error.textContent = message;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    error.textContent = '';
    try {
      await onEnter({ email: form.elements.email.value, password: form.elements.password.value });
    } catch (failure) {
      error.textContent = failure.message || 'Não foi possível entrar. Tente novamente.';
      form.elements.password.value = '';
      form.elements.password.focus();
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };
}
