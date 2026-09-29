export const LOGIN_STATE_PARAM = 'login_state';
const STORAGE_KEY = 'admin-dashboard:login-state';

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function storeState(state: string): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, state);
    return true;
  } catch {
    return false;
  }
}

export function beginLogin(href: string = window.location.href): string {
  const state = randomState();
  storeState(state);
  const url = new URL(href);
  url.hash = '';
  url.searchParams.set(LOGIN_STATE_PARAM, state);
  return url.toString();
}

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

export function stripLoginState(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(LOGIN_STATE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
