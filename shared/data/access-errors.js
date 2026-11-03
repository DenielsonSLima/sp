// A transport failure says nothing about the user's current membership. Keep
// its last validated context while every data operation still checks access in
// Postgres. Authentication/authorization failures must always discard it.
export function isTransientAccessError(error) {
  const status = Number(error?.status);
  const code = String(error?.code ?? '');
  if (status === 401 || status === 403 || /^(42501|28|0L|0P|PGRST3)/.test(code)) return false;
  if (status >= 500 && status < 600) return true;
  if (code || (Number.isFinite(status) && status !== 0)) return false;
  const description = `${error?.name ?? ''}: ${error?.message ?? ''}`;
  return /TimeoutError|NetworkError|FetchError|Failed to fetch|fetch failed|Load failed|Network request failed|NetworkError when attempting to fetch/i.test(description);
}
