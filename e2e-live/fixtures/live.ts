import { expect, request, type Page } from '@playwright/test';
import { NODE_URL, REGISTRY_URL } from '../../playwright.live.config';

export { NODE_URL, REGISTRY_URL };

export const ADMIN_USER = process.env['LIVE_ADMIN_USER'] ?? 'e2eadmin';
export const ADMIN_PASSWORD =
  process.env['LIVE_ADMIN_PASSWORD'] ?? 'e2e-admin-password';

/** The fixture app served by scripts/live-registry.mjs. */
export const PROBE_PACKAGE = 'com.calimero.e2eprobe';
export const PROBE_NAME = 'E2E Probe';
export const PROBE_VERSION = '1.4.2';

/**
 * Mint a real admin token against the node's auth API.
 *
 * This is the same request the desktop's LoginView makes (POST /auth/token with
 * the user_password provider). We call it directly rather than driving the
 * redirect login UI because that UI is auth-frontend, embedded in merod and
 * versioned separately — asserting on its DOM here would make this suite fail
 * whenever auth-frontend restyles a button. What we want to prove is that the
 * DASHBOARD works against a real node with a real JWT.
 */
export async function mintAdminToken(): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const ctx = await request.newContext({ baseURL: NODE_URL });
  try {
    const res = await ctx.post('/auth/token', {
      data: {
        auth_method: 'user_password',
        public_key: ADMIN_USER,
        client_name: NODE_URL,
        timestamp: Date.now(),
        permissions: ['admin'],
        provider_data: { username: ADMIN_USER, password: ADMIN_PASSWORD },
      },
    });

    const bodyText = await res.text();
    expect(
      res.ok(),
      `POST /auth/token failed (${res.status()}): ${bodyText}. ` +
        'The node is initialised with the admin account minted at init time — ' +
        'check scripts/live-node.mjs passed --admin-user and MERO_AUTH_ADMIN_PASSWORD.',
    ).toBeTruthy();

    const body = JSON.parse(bodyText) as {
      data?: { access_token?: string; refresh_token?: string };
      access_token?: string;
      refresh_token?: string;
    };
    const accessToken = body.data?.access_token ?? body.access_token;
    const refreshToken = body.data?.refresh_token ?? body.refresh_token;
    expect(accessToken, `no access_token in ${bodyText}`).toBeTruthy();

    return {
      accessToken: accessToken as string,
      refreshToken: refreshToken ?? '',
    };
  } finally {
    await ctx.dispose();
  }
}

export interface OpenOptions {
  /** Reveals the Node page. */
  developerMode?: boolean;
  /** Point the Marketplace at the local stub instead of the public registry. */
  useStubRegistry?: boolean;
  theme?: 'dark' | 'light';
}

/**
 * Seed a real session plus settings, then navigate.
 *
 * The dashboard is served from the preview server, so `getNodeUrl()` would
 * resolve the node to the preview origin. `?nodeUrl=` is the supported override
 * and persists for the session, which is exactly what it exists for.
 */
export async function openDashboard(
  page: Page,
  path: string,
  opts: OpenOptions = {},
): Promise<void> {
  const { accessToken, refreshToken } = await mintAdminToken();

  await page.addInitScript(
    ({ accessToken: at, refreshToken: rt, nodeUrl, settings, theme }) => {
      // SDK storage keys — see calimero-client src/storage/storage.ts.
      localStorage.setItem('access-token', JSON.stringify(at));
      localStorage.setItem('refresh-token', JSON.stringify(rt));
      localStorage.setItem('app-url', JSON.stringify(nodeUrl));
      localStorage.setItem('auth-url', JSON.stringify(nodeUrl));
      localStorage.setItem('calimero-admin-settings', JSON.stringify(settings));
      localStorage.setItem('calimero-admin-theme', theme);
      // The cache is keyed on the registry list and served stale-while-
      // revalidate; a leftover entry would mask the fetch under test.
      localStorage.removeItem('calimero-marketplace-cache');
    },
    {
      accessToken,
      refreshToken,
      nodeUrl: NODE_URL,
      theme: opts.theme ?? 'dark',
      settings: {
        registries: [
          opts.useStubRegistry
            ? REGISTRY_URL
            : 'https://apps.calimero.network/',
        ],
        developerMode: opts.developerMode ?? true,
      },
    },
  );

  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}nodeUrl=${encodeURIComponent(NODE_URL)}`);
}

/**
 * The real registry package used by the install test.
 *
 * The install source must be PUBLIC: core refuses install URLs whose host is a
 * loopback/private address (an SSRF control in
 * crates/server/primitives/src/validation.rs, re-applied at fetch time to cover
 * redirects), so the local stub cannot serve an install. The registry serves this
 * bundle's .mpk directly over https at ~310KB — small and fast — and because it
 * is a real bundle the install exercises the metadata path that matters:
 * BundleManifest::to_metadata_json, whose output the dashboard reads back.
 */
export const REAL_PACKAGE = 'com.calimero.chat';
export const REAL_APP_NAME = 'Mero Chat';

/**
 * Install an application straight onto the node, for tests that need an app to
 * exist but are not testing the install path itself (namespaces need one to
 * create against).
 *
 * Uses `install-dev-application`, which takes a filesystem PATH rather than a
 * URL and so sidesteps the SSRF guard entirely — the node and the test share a
 * machine. Deterministic and offline.
 */
export async function installProbeApp(): Promise<string> {
  const os = await import('node:os');
  const fsp = await import('node:fs/promises');
  const nodePath = await import('node:path');

  // The smallest valid wasm module. install-* stores the blob without compiling
  // it (compilation happens when a context is created), so this is enough.
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'mero-e2e-app-'));
  const wasmPath = nodePath.join(dir, 'probe.wasm');
  await fsp.writeFile(wasmPath, wasm);

  const metadata = Array.from(
    new TextEncoder().encode(
      JSON.stringify({
        name: PROBE_NAME,
        version: PROBE_VERSION,
        description:
          'Fixture app installed directly for live e2e arrange steps.',
      }),
    ),
  );

  const { status, body } = await adminApi<{
    data?: { applicationId?: string };
  }>('POST', '/install-dev-application', {
    path: wasmPath,
    metadata,
    package: PROBE_PACKAGE,
    version: PROBE_VERSION,
  });

  expect(
    status,
    `install-dev-application failed: ${JSON.stringify(body)}`,
  ).toBeLessThan(300);
  const id = body.data?.applicationId;
  expect(id, `no applicationId in ${JSON.stringify(body)}`).toBeTruthy();
  return id as string;
}

/** Remove every installed application, so specs start from a known state. */
export async function uninstallAllApps(): Promise<void> {
  const { body } = await adminApi<{ data?: { apps?: { id: string }[] } }>(
    'GET',
    '/applications',
  );
  for (const app of body.data?.apps ?? []) {
    await adminApi('DELETE', `/applications/${app.id}`);
  }
}

/**
 * Delete every namespace on the node, contexts first.
 *
 * `DELETE /namespaces/:id` does NOT cascade over contexts — a namespace that
 * still holds one survives the delete, silently, and the leftover then breaks
 * whichever spec asserts on a clean node. Contexts are addressed through their
 * group, so they have to be enumerated per namespace.
 */
export async function clearNamespaces(): Promise<void> {
  const { body } = await adminApi<{ data?: { namespaceId: string }[] }>(
    'GET',
    '/namespaces',
  );
  for (const ns of body.data ?? []) {
    const { body: ctxs } = await adminApi<{ data?: { contextId: string }[] }>(
      'GET',
      `/groups/${ns.namespaceId}/contexts`,
    );
    for (const ctx of ctxs.data ?? []) {
      await adminApi('DELETE', `/contexts/${ctx.contextId}`);
    }
    await adminApi('DELETE', `/namespaces/${ns.namespaceId}`);
  }
}

/** A name unique to this run, so reruns never collide on the shared node. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Direct admin-API call with the minted token, for arrange/assert steps. */
export async function adminApi<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const { accessToken } = await mintAdminToken();
  const ctx = await request.newContext({
    baseURL: NODE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  try {
    // DELETE always carries a body, even an empty one: the node's delete
    // handlers deserialize a JSON body they take no fields from, so a bodyless
    // DELETE is rejected with `400 EOF while parsing a value`. Without this the
    // teardown helpers here fail silently and leave state behind for the next
    // spec — which is how a suite starts depending on run order.
    const data = body === undefined && method === 'DELETE' ? {} : body;
    const res = await ctx.fetch(`/admin-api${path}`, {
      method,
      ...(data === undefined ? {} : { data }),
    });
    const text = await res.text();
    return {
      status: res.status(),
      body: (text ? JSON.parse(text) : {}) as T,
    };
  } finally {
    await ctx.dispose();
  }
}
