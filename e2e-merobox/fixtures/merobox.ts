import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request, type APIRequestContext, type Page } from '@playwright/test';

const exec = promisify(execFile);

/**
 * A merobox-managed cluster of real `merod` nodes, in Docker.
 *
 * Why this exists alongside `e2e-live/`, which already boots a real node:
 * that suite runs ONE node, so it can prove request/response shapes but not
 * anything that needs a second party. Membership is exactly that — an
 * invitation is only meaningful when somebody else redeems it, and "the
 * invitation code the dashboard renders can be redeemed by another node" is
 * the claim the whole invite/join UI rests on. A single node can never fail
 * that test, and so can never pass it either.
 *
 * merobox is the same harness core uses for its own multi-node e2e, so the
 * nodes here are configured the way the rest of the ecosystem tests them.
 */

export const PREFIX = process.env['MEROBOX_PREFIX'] ?? 'admindash-e2e';
export const NODE_COUNT = 2;

export interface MeroboxNode {
  /** Container name, e.g. `admindash-e2e-1`. */
  name: string;
  /** Host-side admin/RPC base, e.g. `http://localhost:2428`. */
  url: string;
}

async function merobox(args: string[], timeoutMs = 600_000): Promise<string> {
  const { stdout, stderr } = await exec('merobox', args, {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return `${stdout}${stderr}`;
}

/**
 * Discover the running nodes and their host ports from Docker itself.
 *
 * `merobox run` auto-detects free ports, so the mapping is only knowable
 * after the fact — reading it back from `docker ps` is the one source that
 * cannot drift from what is actually listening.
 */
export async function discoverNodes(): Promise<MeroboxNode[]> {
  const { stdout } = await exec('docker', [
    'ps',
    '--filter',
    `name=${PREFIX}`,
    '--format',
    '{{.Names}}\t{{.Ports}}',
  ]);
  const nodes: MeroboxNode[] = [];
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const [name, ports] = line.split('\t');
    if (!name || !ports) continue;
    // The admin API is the container's 2428; take whichever host port maps to
    // it. Ports look like `0.0.0.0:2428->2428/tcp, 0.0.0.0:2528->2528/udp`.
    const match = /0\.0\.0\.0:(\d+)->2428\/tcp/.exec(ports);
    if (!match) continue;
    nodes.push({ name, url: `http://localhost:${match[1]}` });
  }
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function startCluster(): Promise<MeroboxNode[]> {
  // Idempotent: a cluster left over from an interrupted run is reused rather
  // than colliding on container names.
  const existing = await discoverNodes();
  if (existing.length >= NODE_COUNT) return existing;

  await merobox(['run', '-c', String(NODE_COUNT), '--prefix', PREFIX]);
  const nodes = await discoverNodes();
  if (nodes.length < NODE_COUNT) {
    throw new Error(
      `merobox started ${nodes.length}/${NODE_COUNT} nodes. ` +
        'Check `docker ps` and that the merod image could be pulled.',
    );
  }
  await Promise.all(nodes.map((n) => waitForHealth(n)));
  return nodes;
}

export async function stopCluster(): Promise<void> {
  // Never fail teardown: a stop error must not turn a green run red.
  await merobox(['stop', '--all'], 120_000).catch(() => '');
}

async function waitForHealth(node: MeroboxNode, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const ctx = await request.newContext();
  try {
    for (;;) {
      try {
        const res = await ctx.get(`${node.url}/admin-api/health`, {
          timeout: 5000,
        });
        if (res.ok()) return;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) {
        throw new Error(`${node.name} never became healthy at ${node.url}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    await ctx.dispose();
  }
}

/**
 * A token for a merobox node, when it wants one.
 *
 * merobox runs merod without the auth service unless asked for it, so
 * `/auth/token` may simply not exist. Treat that as "no auth required" rather
 * than as a failure — the admin API is then open on the container's own
 * network, which is what makes this harness cheap to run.
 */
export async function tokenFor(node: MeroboxNode): Promise<string | null> {
  const ctx = await request.newContext({ baseURL: node.url });
  try {
    const res = await ctx.post('/auth/token', {
      data: {
        auth_method: 'user_password',
        public_key: 'admin',
        client_name: node.url,
        timestamp: Date.now(),
        permissions: ['admin'],
        provider_data: { username: 'admin', password: 'admin' },
      },
      failOnStatusCode: false,
    });
    if (!res.ok()) return null;
    const body = (await res.json()) as {
      data?: { access_token?: string };
      access_token?: string;
    };
    return body.data?.access_token ?? body.access_token ?? null;
  } catch {
    return null;
  } finally {
    await ctx.dispose();
  }
}

export interface NodeApi {
  ctx: APIRequestContext;
  get<T>(path: string): Promise<{ status: number; body: T }>;
  post<T>(path: string, data?: unknown): Promise<{ status: number; body: T }>;
  del<T>(path: string): Promise<{ status: number; body: T }>;
  dispose(): Promise<void>;
}

/** Admin-API client for one node. */
export async function apiFor(node: MeroboxNode): Promise<NodeApi> {
  const token = await tokenFor(node);
  const ctx = await request.newContext({
    baseURL: node.url,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const parse = async <T>(res: {
    status(): number;
    text(): Promise<string>;
  }): Promise<{ status: number; body: T }> => {
    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: res.status(), body: body as T };
  };
  return {
    ctx,
    async get<T>(path: string) {
      return parse<T>(
        await ctx.get(`/admin-api${path}`, { failOnStatusCode: false }),
      );
    },
    async post<T>(path: string, data: unknown = {}) {
      return parse<T>(
        await ctx.post(`/admin-api${path}`, { data, failOnStatusCode: false }),
      );
    },
    async del<T>(path: string) {
      return parse<T>(
        await ctx.delete(`/admin-api${path}`, {
          data: {},
          failOnStatusCode: false,
        }),
      );
    },
    dispose: () => ctx.dispose(),
  };
}

/**
 * Point the dashboard at one of the cluster's nodes.
 *
 * `?nodeUrl=` is the supported override (the app otherwise derives the node
 * from its own origin, which here is the preview server). The token is seeded
 * into the SDK's storage keys when the node issues one; when it does not, the
 * dashboard still needs SOMETHING in `access-token` or AuthWrapper parks on
 * the login screen, so a syntactically valid unsigned JWT stands in.
 */
export async function openDashboardOn(
  page: Page,
  node: MeroboxNode,
  path: string,
): Promise<void> {
  const token = await tokenFor(node);
  await page.addInitScript(
    ({ token: t, nodeUrl }) => {
      const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
      const placeholder = [
        b64({ alg: 'none', typ: 'JWT' }),
        b64({
          sub: 'merobox-admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
          permissions: ['admin'],
        }),
        'sig',
      ].join('.');
      localStorage.setItem('access-token', JSON.stringify(t ?? placeholder));
      localStorage.setItem('refresh-token', JSON.stringify('refresh-merobox'));
      localStorage.setItem('app-url', JSON.stringify(nodeUrl));
      localStorage.setItem('auth-url', JSON.stringify(nodeUrl));
      localStorage.setItem(
        'calimero-admin-settings',
        JSON.stringify({
          registries: ['https://apps.calimero.network/'],
          developerMode: true,
        }),
      );
      localStorage.setItem('calimero-admin-theme', 'dark');
    },
    { token, nodeUrl: node.url },
  );

  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}nodeUrl=${encodeURIComponent(node.url)}`);
}
