import { describe, it, expect, beforeEach } from 'vitest';

import {
  LOGIN_STATE_PARAM,
  beginLogin,
  consumeLoginState,
  stripLoginState,
} from '../utils/loginState';

const DASHBOARD = 'http://localhost:2528/admin-dashboard/dashboard';

describe('login state', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('puts a fresh state in the callback query and drops the hash', () => {
    const cb = new URL(beginLogin(`${DASHBOARD}?tab=x#stale`));
    const state = cb.searchParams.get(LOGIN_STATE_PARAM);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(cb.searchParams.get('tab')).toBe('x');
    expect(cb.hash).toBe('');
    expect(
      new URL(beginLogin(DASHBOARD)).searchParams.get(LOGIN_STATE_PARAM),
    ).not.toBe(state);
  });

  it('accepts the hand-back of the login this tab started', () => {
    const cb = beginLogin(DASHBOARD);
    expect(consumeLoginState(`${cb}#access_token=a&refresh_token=b`)).toBe(
      true,
    );
  });

  it('refuses a hand-back with no login in flight', () => {
    expect(
      consumeLoginState(
        `${DASHBOARD}?${LOGIN_STATE_PARAM}=deadbeef#access_token=a`,
      ),
    ).toBe(false);
  });

  it('refuses a mismatched or missing state', () => {
    beginLogin(DASHBOARD);
    expect(consumeLoginState(`${DASHBOARD}?${LOGIN_STATE_PARAM}=nope`)).toBe(
      false,
    );
    beginLogin(DASHBOARD);
    expect(consumeLoginState(DASHBOARD)).toBe(false);
  });

  it('is single-use', () => {
    const cb = beginLogin(DASHBOARD);
    expect(consumeLoginState(cb)).toBe(true);
    expect(consumeLoginState(cb)).toBe(false);
  });

  it('strips only the state from the query', () => {
    expect(stripLoginState(`?${LOGIN_STATE_PARAM}=abc&tab=x`)).toBe('?tab=x');
    expect(stripLoginState(`?${LOGIN_STATE_PARAM}=abc`)).toBe('');
    expect(stripLoginState('')).toBe('');
  });
});
