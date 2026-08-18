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

/**
 * A minimal ABI whose `init` takes one parameter of each shape the form has a
 * control for: a string, a payload-free variant (→ select) and an integer.
 * Mirrors the shape core emits (`crates/wasm-abi/src/schema.rs`), which is
 * snake_case unlike the camelCase admin API around it.
 */
export const ABI_WITH_INIT = {
  schema_version: 'wasm-abi/1',
  types: {
    ContextType: {
      kind: 'variant',
      variants: [{ name: 'Channel' }, { name: 'Dm' }],
    },
  },
  methods: [
    {
      name: 'init',
      params: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'context_type', type: { $ref: 'ContextType' } },
        { name: 'created_at', type: { kind: 'u64' } },
      ],
      returns: { kind: 'unit' },
    },
    { name: 'send', params: [{ name: 'text', type: { kind: 'string' } }] },
  ],
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
  /** `GET /admin-api/blobs` — snake_case, exactly as the node returns it. */
  blobs?: { blob_id: string; size: number }[];
  /** `GET .../admin/keys` and `.../admin/keys/clients` (SDK adminApi). */
  rootKeys?: Record<string, unknown>[];
  clientKeys?: Record<string, unknown>[];
  /** `GET /admin-api/namespaces`. */
  namespaces?: MockNamespace[];
  /**
   * `GET /admin-api/identity` — who this node is.
   *
   * Node-level, taking no namespace: core 0.11.0-rc.23 deleted
   * `GET /namespaces/:id/identity` (#3522) because it answered with the node's
   * account whichever namespace you passed. Set to `null` to serve the 404 a
   * node that has joined nothing answers with, which is a normal state and must
   * not break the page.
   */
  nodeIdentity?: MockNodeIdentity | null;
  /**
   * Per-group state, keyed by group id. A namespace IS a group, so its own
   * root entry is keyed by the namespace id.
   */
  groups?: Record<string, MockGroup>;
  /**
   * `GET /admin-api/applications/:id/abi`, keyed by application id. The
   * create-context form is generated from this; an app with no entry answers
   * 404, which is the real "raw wasm, no embedded ABI" case.
   */
  abis?: Record<string, unknown>;
}

export interface MockNamespace {
  namespaceId: string;
  targetApplicationId: string;
  upgradePolicy?: string;
  name?: string;
  appVersion?: string;
  memberCount?: number;
  contextCount?: number;
  subgroupCount?: number;
}

export interface MockNodeIdentity {
  /** 64 HEX characters. This is what a member row's `identity` holds. */
  accountId: string;
  /** Hex `DeviceId`. Absent on a node that has not enrolled yet. */
  deviceId?: string;
  /** base58 — the device's SIGNING key, which never appears in a member list. */
  publicKey: string;
  accountRootPublicKey?: string;
}

export interface MockGroup {
  /** Display name — lives in group metadata on the wire, not at the top level. */
  name?: string;
  subgroupVisibility?: string;
  /**
   * `identity` is an ACCOUNT (64 hex), not a key. rc.23 keys membership rows by
   * the person rather than by one of their device keys.
   */
  members?: { identity: string; role: string; name?: string }[];
  contexts?: { contextId: string; name?: string }[];
  subgroups?: { groupId: string; name?: string }[];
}

/** A node identity whose ids are shaped the way the real ones are. */
export const NODE_IDENTITY: MockNodeIdentity = {
  accountId: 'ac'.repeat(32),
  deviceId: 'de'.repeat(32),
  publicKey: '2Fb1JXPZQZmGRoLPS9F6JsPRRTL1cKnQfCzYAeZLmDaG',
  accountRootPublicKey: 'r0'.repeat(32),
};

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

  // /ready answers 503 while Starting/ShuttingDown, and the lifecycle label is
  // in that body — the Node page treats a non-OK here as data, not an error.
  await page.route('**/admin-api/ready', (route) =>
    opts.unhealthy
      ? json(route, { data: { status: 'ShuttingDown' } }, 503)
      : json(route, { data: { status: 'ready' } }),
  );

  await page.route('**/admin-api/applications', (route) =>
    json(route, { data: { apps } }),
  );

  // Every method answers the same empty envelope — no test asserts on an
  // uninstall response body, and GET of a single application is never read.
  await page.route('**/admin-api/applications/*', (route) =>
    json(route, { data: {} }),
  );

  // AFTER `applications/*`, so it wins: Playwright resolves routes in reverse
  // registration order, and `applications/*` also matches `.../abi`.
  await page.route('**/admin-api/applications/*/abi**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const id = /\/applications\/([^/]+)\/abi/.exec(path)?.[1];
    const abi = id ? opts.abis?.[id] : undefined;
    // 404 is how the node reports an application with no embedded ABI.
    return abi
      ? json(route, { data: abi })
      : json(route, { error: 'no abi' }, 404);
  });

  await page.route('**/admin-api/contexts', (route) =>
    json(route, { data: { contexts } }),
  );

  await page.route('**/admin-api/peers', (route) =>
    json(route, { data: { count: 3 } }),
  );

  await page.route('**/admin-api/blobs', (route) =>
    json(route, { data: { blobs: opts.blobs ?? [] } }),
  );
  await page.route('**/admin-api/blobs/*', (route) =>
    json(route, { data: {} }),
  );

  // Root keys first, clients second: Playwright resolves in reverse
  // registration order, so the more specific pattern has to come last or
  // `admin/keys` swallows `admin/keys/clients`.
  await page.route('**/admin/keys', (route) =>
    json(route, { data: opts.rootKeys ?? [] }),
  );
  await page.route('**/admin/keys/clients', (route) =>
    json(route, { data: opts.clientKeys ?? [] }),
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

  // `GET /admin-api/identity`. `nodeIdentity: null` opts into the 404 a node
  // that holds neither a device nor an account root answers — the page must
  // still render, just without marking anyone "you".
  const nodeIdentity =
    opts.nodeIdentity === undefined ? NODE_IDENTITY : opts.nodeIdentity;
  await page.route('**/admin-api/identity', (route) =>
    nodeIdentity
      ? json(route, { data: nodeIdentity })
      : json(
          route,
          { error: 'this node holds neither a device nor a root' },
          404,
        ),
  );

  // Namespaces + groups (raw fetches in src/api/namespaceApi.ts).
  //
  // One dispatcher per prefix rather than a glob per endpoint: the response
  // ENVELOPES differ between these routes (`{ data }` vs `{ members }` vs
  // `{ subgroups }`), and matching on the parsed path makes that explicit
  // instead of depending on Playwright's reverse-order glob resolution.
  const namespaces = opts.namespaces ?? [];
  const groups = opts.groups ?? {};
  const groupOf = (id: string): MockGroup => groups[id] ?? {};

  await page.route('**/admin-api/namespaces**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const [, id, sub] =
      /\/admin-api\/namespaces(?:\/([^/]+))?(?:\/([^/]+))?/.exec(path) ?? [];

    if (!id) {
      return json(route, {
        data: namespaces.map((ns) => ({
          appKey: 'a'.repeat(64),
          upgradePolicy: 'Automatic',
          createdAt: 0,
          memberCount: 0,
          contextCount: 0,
          subgroupCount: 0,
          ...ns,
        })),
      });
    }
    // No `identity` branch on purpose. rc.23 deleted
    // `GET /namespaces/:id/identity`, so it falls through to the catch-all
    // below — anything that starts calling it again reads `{}` and fails
    // visibly rather than being quietly served a shape the node no longer has.
    if (sub === 'groups') {
      return json(route, { data: groupOf(id).subgroups ?? [] });
    }
    return json(route, { data: {} });
  });

  await page.route('**/admin-api/groups**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const [, id, sub] =
      /\/admin-api\/groups(?:\/([^/]+))?(?:\/([^/]+))?/.exec(path) ?? [];
    const group = id ? groupOf(id) : {};

    // `{ members }` and nothing else. rc.23 removed `selfIdentity` from this
    // response; serving it anyway would keep the suite green against a shape
    // the node no longer sends, which is the whole point of pinning it here.
    if (sub === 'members') {
      return json(route, { members: group.members ?? [] });
    }
    if (sub === 'contexts') {
      return json(route, { data: group.contexts ?? [] });
    }
    if (sub === 'subgroups') {
      return json(route, { subgroups: group.subgroups ?? [] });
    }
    if (id && !sub) {
      return json(route, {
        data: {
          groupId: id,
          appKey: 'a'.repeat(64),
          targetApplicationId: APP_WITH_FRONTEND.id,
          upgradePolicy: 'Automatic',
          memberCount: group.members?.length ?? 0,
          contextCount: group.contexts?.length ?? 0,
          defaultCapabilities: 11,
          subgroupVisibility: group.subgroupVisibility ?? 'open',
          groupStateHash: '0'.repeat(64),
          ...(group.name ? { metadata: { name: group.name, data: {} } } : {}),
        },
      });
    }
    return json(route, { data: {} });
  });

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
  await page.route('**/api/v2/bundles**', (route) => {
    // Honour ?package= the way the real registry does, so the version picker
    // gets this app's versions and not every app's.
    const pkg = new URL(route.request().url()).searchParams.get('package');
    const list = pkg ? bundles.filter((b) => b.package === pkg) : bundles;
    return json(route, list);
  });

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
