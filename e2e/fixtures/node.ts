import type { Page, Route } from '@playwright/test';

/**
 * A mocked Calimero node.
 *
 * IMPORTANT: routes are registered against the *preview server's* origin, because
 * that is where the app derives its node URL from — it is served at
 * `/admin-dashboard/` and treats the serving origin as the node (see
 * src/utils/nodeUrl.ts). Registering an absolute pattern against some other host
 * silently matches nothing and the app just sees a dead node.
 */

/** Metadata exactly as `BundleManifest::to_metadata_json` emits it. */
export function bundleMetadata(overrides: Record<string, unknown> = {}) {
  return {
    package: 'com.calimero.meroblocks',
    version: '0.1.1',
    name: 'Mero Blocks',
    description: 'Minecraft-style P2P voxel sandbox.',
    author: 'Calimero',
    links: { frontend: 'https://app.invalid/blocks/' },
    ...overrides,
  };
}

/** Encode metadata the way the admin API returns it: a byte array. */
export function metadataBytes(meta: Record<string, unknown>): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(meta)));
}

export interface MockApp {
  id: string;
  size?: number;
  metadata: number[];
}

export const APP_WITH_FRONTEND: MockApp = {
  id: 'AppWithFrontend1111111111111111111111111111',
  size: 512 * 1024,
  metadata: metadataBytes(bundleMetadata()),
};

/** An app whose bundle declared no frontend — must render without an Open button. */
export const APP_WITHOUT_FRONTEND: MockApp = {
  id: 'AppNoFrontend22222222222222222222222222222',
  size: 1024 * 1024,
  metadata: metadataBytes(
    bundleMetadata({ name: 'Headless Service', version: '2.5.0', links: {} }),
  ),
};

export interface MockNodeOptions {
  apps?: MockApp[];
  contexts?: { id: string; applicationId: string }[];
  /** Serve 503 from /health to exercise the disconnected indicator. */
  unhealthy?: boolean;
  /** Registry bundles served from apps.calimero.network. */
  bundles?: {
    package: string;
    appVersion: string;
    metadata?: Record<string, unknown>;
  }[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

/**
 * Install mocks for every network call the dashboard makes, then seed a token so
 * AuthWrapper resolves straight to `authenticated`.
 */
export async function mockNode(page: Page, opts: MockNodeOptions = {}) {
  const apps = opts.apps ?? [APP_WITH_FRONTEND, APP_WITHOUT_FRONTEND];
  const contexts = opts.contexts ?? [];

  // ORDER MATTERS. Playwright evaluates routes in REVERSE registration order,
  // so the last matching handler registered wins. The catch-all must therefore
  // be registered FIRST — registering it last silently swallows every specific
  // route below and every list in the app renders empty.
  await page.route('**/admin-api/**', (route) => json(route, { data: {} }));

  await page.route('**/admin-api/health', (route) =>
    opts.unhealthy
      ? json(route, { data: { status: 'store_unavailable' } }, 503)
      : json(route, { data: { status: 'alive' } }),
  );

  await page.route('**/admin-api/applications', (route) =>
    json(route, { data: { apps } }),
  );

  await page.route('**/admin-api/applications/*', (route) => {
    if (route.request().method() === 'DELETE') {
      return json(route, { data: {} });
    }
    return json(route, { data: {} });
  });

  await page.route('**/admin-api/contexts', (route) =>
    json(route, { data: { contexts } }),
  );

  await page.route('**/admin-api/peers', (route) =>
    json(route, { data: { count: 3 } }),
  );

  await page.route('**/admin-api/network/status', (route) =>
    json(route, {
      data: {
        localPeerId: '12D3KooWMockPeerId',
        listenAddrs: ['/ip4/127.0.0.1/tcp/2428'],
        externalAddrs: [],
        relays: [],
        rendezvous: [],
        autonat: [],
      },
    }),
  );

  await page.route('**/admin-api/usage', (route) =>
    json(route, { data: { namespaces: [] } }),
  );

  // Namespaces list (raw fetch in src/api/namespaceApi.ts).
  await page.route('**/admin-api/groups**', (route) =>
    json(route, { data: [] }),
  );
  await page.route('**/admin-api/namespaces**', (route) =>
    json(route, { data: [] }),
  );

  // Registry (Marketplace). Matched on the registry host, not the node.
  const bundles = opts.bundles ?? [
    {
      package: 'com.calimero.merochat',
      appVersion: '1.2.0',
      metadata: { name: 'Mero Chat', description: 'Chat over Calimero.' },
    },
  ];
  // A bare array, matching the real contract: GET /api/v2/bundles returns
  // the list directly, not a { bundles } envelope (verified against
  // app-registry's local-server and its own frontend client).
  await page.route('**/api/v2/bundles**', (route) => json(route, bundles));

  // App frontends opened in a new tab. Registered on the context because a popup
  // is a separate Page — page.route() would not apply to it, and the tab would
  // hang on an unresolvable host.
  await page.context().route('https://app.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Mock App</title><body>mock app</body>',
    }),
  );

  await seedSession(page);
}

/**
 * Seed the SDK's storage keys before the app boots, so AuthWrapper finds tokens
 * and skips the login screen. The token is a syntactically valid unsigned JWT —
 * `setContextAndIdentityFromJWT` parses the payload.
 */
export async function seedSession(page: Page) {
  // Storage keys and the JSON.stringify wrapping come from the SDK's
  // src/storage/storage.ts (APP_URL='app-url', ACCESS_TOKEN='access-token',
  // REFRESH_TOKEN='refresh-token'). Getting either wrong leaves the app on the
  // login screen with no visible clue why.
  await page.addInitScript(() => {
    // addInitScript runs on EVERY navigation, including the reload that logout
    // performs. Without this guard it would immediately re-seed the tokens
    // logout just cleared, and the logout flow would be untestable.
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');

    const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
    // Standard base64, not base64url: the SDK parses the payload with plain
    // `atob` (setContextAndIdentityFromJWT), which rejects -/_ alphabets.
    const token = [
      b64({ alg: 'none', typ: 'JWT' }),
      b64({
        sub: 'e2e-admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
        permissions: ['admin'],
      }),
      'sig',
    ].join('.');

    localStorage.setItem('access-token', JSON.stringify(token));
    localStorage.setItem('refresh-token', JSON.stringify('refresh-e2e'));
    localStorage.setItem('app-url', JSON.stringify(window.location.origin));
    localStorage.setItem('auth-url', JSON.stringify(window.location.origin));
  });
}
