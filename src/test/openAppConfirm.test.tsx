/* eslint-disable no-script-url */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';

import { ToastProvider } from '../contexts/ToastContext';
import { useOpenApp } from '../hooks/useOpenApp';
import type { InstalledApplication } from '../utils/installedApps';

const ADMIN_TOKEN = 'admin.header.signature';
const TOKENS = { access_token: 'app.access', refresh_token: 'app.refresh' };

vi.mock('@calimero-network/calimero-client', () => ({
  getAccessToken: () => ADMIN_TOKEN,
}));

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      protocol: url.protocol,
    },
  });
}

function encodeMetadata(meta: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  return btoa(String.fromCharCode(...bytes));
}

function makeApp(id: string, frontend: string): InstalledApplication {
  return {
    id,
    metadata: encodeMetadata({
      name: 'Mero Blocks',
      package: 'network.calimero.blocks',
      links: { frontend },
    }),
  };
}

function Harness({ app, url }: { app: InstalledApplication; url: string }) {
  const { requestOpen, dialog } = useOpenApp();
  return (
    <>
      <button type="button" onClick={() => requestOpen(url, app)}>
        launch
      </button>
      {dialog}
    </>
  );
}

function renderHarness(app: InstalledApplication, url: string) {
  return render(
    <ToastProvider>
      <Harness app={app} url={url} />
    </ToastProvider>,
  );
}

function fakeTab() {
  return {
    location: { replace: vi.fn() },
    opener: {} as unknown,
    close: vi.fn(),
  };
}

describe('opening an app asks first', () => {
  const originalOpen = window.open;
  let open: ReturnType<typeof vi.fn>;
  let tab: ReturnType<typeof fakeTab>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLocation('http://localhost:2528/admin-dashboard/applications');
    localStorage.clear();
    tab = fakeTab();
    open = vi.fn().mockReturnValue(tab);
    window.open = open as unknown as typeof window.open;
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: TOKENS, error: null }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    window.open = originalOpen;
    vi.unstubAllGlobals();
  });

  it('shows the destination host, origin and app before anything is sent', () => {
    const url = 'https://blocks.app.example:8443/play/?x=1';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('open-app-confirm-host')).toHaveTextContent(
      /^blocks\.app\.example$/,
    );
    expect(screen.getByTestId('open-app-confirm-origin')).toHaveTextContent(
      /^https:\/\/blocks\.app\.example:8443$/,
    );
    expect(dialog).toHaveTextContent('Mero Blocks');
    expect(dialog).toHaveTextContent('network.calimero.blocks');
    expect(screen.getByTestId('open-app-confirm-cancel')).toHaveFocus();

    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Cancel opens nothing and mints nothing', () => {
    const url = 'https://app.example/';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-cancel'));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('Escape cancels too', () => {
    const url = 'https://app.example/';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirming mints the minimal grant set and puts the pair in the fragment', async () => {
    const url = 'https://app.example/blocks/';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-accept'));

    expect(open).toHaveBeenCalledWith('about:blank', 'app-app-1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));

    const [mintUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(mintUrl).toBe('http://localhost:2528/admin/client-key');
    const body = JSON.parse(init.body as string) as { permissions: string[] };
    expect(new Set(body.permissions)).toEqual(
      new Set([
        'context:create',
        'context:list',
        'context:execute',
        'context:subscribe',
        'application:list',
        'namespace',
        'group',
        'blob:add',
        'blob:get',
        'blob:remove',
        'context:alias',
      ]),
    );
    expect(body.permissions).toHaveLength(11);

    const dest = new URL(tab.location.replace.mock.calls[0]?.[0] as string);
    expect(dest.origin).toBe('https://app.example');
    expect(dest.pathname).toBe('/blocks/');
    const hash = new URLSearchParams(dest.hash.slice(1));
    expect(hash.get('access_token')).toBe(TOKENS.access_token);
    expect(hash.get('refresh_token')).toBe(TOKENS.refresh_token);
    expect(hash.get('application_id')).toBe('app-1');
    expect(dest.search).not.toContain('token');
  });

  it('asks again next time unless told to remember', async () => {
    const url = 'https://app.example/';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-accept'));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalled());

    fireEvent.click(screen.getByText('launch'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a remembered origin opens directly for that app', async () => {
    const url = 'https://app.example/';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-remember'));
    fireEvent.click(screen.getByTestId('open-app-confirm-accept'));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('launch'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(2));
  });

  it('asks again when the remembered app moves to another origin', () => {
    const first = 'https://app.example/';
    const view = renderHarness(makeApp('app-1', first), first);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-remember'));
    fireEvent.click(screen.getByTestId('open-app-confirm-accept'));
    view.unmount();

    const moved = 'https://elsewhere.example/';
    renderHarness(makeApp('app-1', moved), moved);
    fireEvent.click(screen.getByText('launch'));

    expect(screen.getByTestId('open-app-confirm-host')).toHaveTextContent(
      /^elsewhere\.example$/,
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('remembering one app does not trust another at the same origin', () => {
    const url = 'https://app.example/';
    const view = renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));
    fireEvent.click(screen.getByTestId('open-app-confirm-remember'));
    fireEvent.click(screen.getByTestId('open-app-confirm-accept'));
    view.unmount();

    renderHarness(makeApp('app-2', url), url);
    fireEvent.click(screen.getByText('launch'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('a disallowed URL is refused without a prompt or a tab', () => {
    const url = 'javascript:alert(1)';
    renderHarness(makeApp('app-1', url), url);

    fireEvent.click(screen.getByText('launch'));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
