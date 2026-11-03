import { getSupabase } from './client.js';
import { loadContext, setContext, refreshAccess } from './api.js';
let signingIn = false;

export async function signIn({ email, password }) {
  signingIn = true;
  try {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error)
      throw Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
    await loadContext();
    return data.session;
  } finally {
    signingIn = false;
  }
}
export async function restoreSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) {
    await setContext(null);
    return null;
  }
  await loadContext();
  return data.session;
}
export async function signOut() {
  await setContext(null);
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) throw error;
}
export function onAuthChange(callback) {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    // Supabase callbacks run under the auth lock; perform any RPC in a later task.
    const report = (error) => console.error('Não foi possível atualizar a sessão.', error);
    if (event === 'SIGNED_OUT')
      setTimeout(() => {
        void setContext(null)
          .then(() => callback(event, null))
          .catch(report);
      }, 0);
    if (event === 'SIGNED_IN' && !signingIn)
      setTimeout(() => {
        Promise.resolve(callback(event, session)).catch(report);
      }, 0);
    if (event === 'TOKEN_REFRESHED')
      setTimeout(() => {
        void refreshAccess().catch(report);
      }, 0);
  });
  return () => data.subscription.unsubscribe();
}
