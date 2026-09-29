/**
 * Bind a login's token hand-back to the login THIS tab started.
 *
 * The auth frontend returns to our callback URL with the tokens in the hash,
 * and AuthWrapper adopts whatever it finds there. Without a check, any link of
 * the form `/admin-dashboard/#access_token=…&refresh_token=…` would silently
 * replace the admin's session with one the link's author chose (login CSRF).
 *
 * So `handleLogin` stores a random state in sessionStorage and puts it in the
 * callback URL's QUERY — the auth frontend keeps the callback's query and only
 * appends the hash — and hash tokens are adopted only when the two match.
 */
export const LOGIN_STATE_PARAM = 'login_state';
const STORAGE_KEY = 'admin-dashboard:login-state';

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Start a login: remember a fresh state and return the callback URL for it. */
export function beginLogin(href: string = window.location.href): string {
  const state = randomState();
  try {
    sessionStorage.setItem(STORAGE_KEY, state);
  } catch {
    // Storage unavailable: the returning hash will then be refused, which is
    // the safe failure — the user sees the login screen again.
  }
  const url = new URL(href);
  url.hash = '';
  url.searchParams.set(LOGIN_STATE_PARAM, state);
  return url.toString();
}

/**
 * Whether `href` carries the state of the login this tab started. Single-use:
 * the stored state is dropped either way, so a replayed callback is refused.
 */
export function consumeLoginState(
  href: string = window.location.href,
): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return false;
  }
  const returned = new URL(href).searchParams.get(LOGIN_STATE_PARAM);
  return Boolean(stored && returned && stored === returned);
}

/** `search` with the login state removed, for rewriting the address bar. */
export function stripLoginState(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(LOGIN_STATE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
