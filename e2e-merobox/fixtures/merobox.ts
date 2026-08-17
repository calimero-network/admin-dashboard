import { execFile, spawn, type ChildProcess } from 'node:child_process';
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

/**
 * Run merobox, echoing everything it said.
 *
 * The output is the only account of what happened: `merobox run` can fail to
 * start a node and still exit 0 (a stale container name 409s, and it carries
 * on), so a silent success is not evidence of one. Swallowing this turned a
 * CI failure into "started 0/2 nodes" with no reason attached.
 */
async function merobox(args: string[], timeoutMs = 600_000): Promise<string> {
  try {
    const { stdout, stderr } = await exec('merobox', args, {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    const output = `${stdout}${stderr}`;
    console.log(`[merobox ${args.join(' ')}]\n${output}`);
    return output;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    console.error(
      `[merobox ${args.join(' ')}] FAILED: ${err.message}\n${output}`,
    );
    throw e;
  }
}

/**
 * Every container Docker knows about, for a failure message.
 *
 * Deliberately unfiltered: a `--filter name=<prefix>` here is what hid the
 * problem last time — it showed only the init containers and made it look as
 * if merobox had started nothing, when the nodes were running under names
 * that simply did not carry the prefix.
 */
async function dockerState(): Promise<string> {
  try {
    const { stdout } = await exec('docker', [
      'ps',
      '-a',
      '--format',
      '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
    ]);
    return stdout.trim() || '(docker reports no containers at all)';
  } catch (e) {
    return `docker ps failed: ${(e as Error).message}`;
  }
}

/**
 * Discover the running nodes and their host ports from Docker itself.
 *
 * Matched by IMAGE, not by container name. merobox's `--prefix` names the
 * NODE, and the container it creates does not reliably carry that prefix — in
 * CI only the throwaway `<prefix>-init` containers matched
 * `--filter name=<prefix>`, so discovery found nothing while merobox reported
 * "2/2 nodes started successfully". The image is the one property every node
 * container has by definition.
 *
 * Host ports are auto-assigned by merobox, so the mapping is only knowable
 * after the fact — reading it back from `docker ps` is the one source that
 * cannot drift from what is actually listening.
 */
export async function discoverNodes(): Promise<MeroboxNode[]> {
  const { stdout } = await exec('docker', [
    'ps',
    '--format',
    '{{.Names}}\t{{.Image}}\t{{.Ports}}',
  ]);
  const nodes: MeroboxNode[] = [];
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const [name, image, ports] = line.split('\t');
    if (!name || !image || !ports) continue;
    // Any running container on the merod image is one of ours; the init
    // containers exit immediately and so never appear in a plain `docker ps`.
    if (!image.includes('merod')) continue;
    // The admin API is the container's **2528**, not 2428. merobox configures
    // merod the opposite way round from the docs' single-node example
    // (`--server-port 2428 --swarm-port 2528`): inside a merobox container
    // 2428 is P2P. Reading the wrong one gets a port that accepts TCP and
    // answers nothing, which fails as a timeout rather than a refused
    // connection.
    //
    // The host side is `0.0.0.0:` or `[::]:` depending on the daemon's
    // settings, so anchor on the container port instead.
    const match = /(?:0\.0\.0\.0|\[::\]):(\d+)->2528\/tcp/.exec(ports);
    if (!match) continue;
    nodes.push({ name, url: `http://localhost:${match[1]}` });
  }
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The `merobox run` process, held for the lifetime of the suite.
 *
 * `merobox run` is NOT "create detached containers and return" — it owns the
 * cluster for as long as it lives and tears it down on the way out:
 *
 *     Deployment Summary: 2/2 nodes started successfully
 *     Stopping managed containers with graceful shutdown...
 *     ✓ Gracefully stopped and removed admindash-e2e-1
 *
 * Awaiting it therefore guaranteed an empty cluster by the time the first test
 * ran, which is exactly what CI showed: merobox reporting 2/2 started, and
 * `docker ps -a` listing only the two exited init containers. There is no
 * `--detach`, so the process has to be kept alive instead — the same shape as
 * a Playwright `webServer`.
 */
let clusterProcess: ChildProcess | null = null;

export async function startCluster(): Promise<MeroboxNode[]> {
  // Idempotent: a cluster left over from an interrupted run is reused rather
  // than colliding on container names.
  const existing = await discoverNodes();
  if (existing.length >= NODE_COUNT) {
    await Promise.all(existing.map((n) => waitForHealth(n)));
    return existing;
  }

  // merobox initialises each node with a throwaway `<name>-init` container it
  // does not always clean up. A leftover one makes the NEXT run fail that node
  // with `409 Conflict … name already in use` — and merobox keeps going and
  // exits 0, so the cluster comes up one node short and the failure only
  // surfaces later as "cluster is not running".
  const stale = await staleInitContainers();
  if (stale.length) {
    await exec('docker', ['rm', '-f', ...stale]).catch(() => undefined);
  }

  const log: string[] = [];
  clusterProcess = spawn(
    'merobox',
    ['run', '-c', String(NODE_COUNT), '--prefix', PREFIX],
    {
      // stdin stays an OPEN pipe we never write to or close. Handing merobox a
      // closed stdin is itself a reason for it to wind down, and we want it to
      // sit there holding the cluster until teardown.
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    },
  );
  const record = (chunk: Buffer) => {
    const text = chunk.toString();
    log.push(text);
    process.stdout.write(`[merobox] ${text}`);
  };
  clusterProcess.stdout?.on('data', record);
  clusterProcess.stderr?.on('data', record);

  let processExited: number | null = null;
  clusterProcess.on('exit', (code) => {
    processExited = code ?? -1;
  });
  clusterProcess.on('error', (e) => log.push(`spawn error: ${e.message}`));

  // Readiness is the containers appearing, not the command returning — it
  // never returns while things are working.
  const deadline = Date.now() + 300_000;
  let nodes: MeroboxNode[] = [];
  for (;;) {
    nodes = await discoverNodes();
    if (nodes.length >= NODE_COUNT) break;
    if (processExited !== null) {
      throw new Error(
        `merobox exited (code ${processExited}) with ${nodes.length}/${NODE_COUNT} ` +
          `nodes up.\n--- merobox output ---\n${log.join('')}\n` +
          `--- docker ps -a ---\n${await dockerState()}`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `merobox brought up ${nodes.length}/${NODE_COUNT} nodes within 5min.\n` +
          `--- merobox output ---\n${log.join('')}\n` +
          `--- docker ps -a ---\n${await dockerState()}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  await Promise.all(nodes.map((n) => waitForHealth(n)));
  return nodes;
}

/**
 * The `<prefix>-init` containers, which merobox does name for the prefix and
 * does not always remove.
 */
async function staleInitContainers(): Promise<string[]> {
  const { stdout } = await exec('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${PREFIX}`,
    '--format',
    '{{.Names}}',
  ]);
  return stdout
    .trim()
    .split('\n')
    .filter((name) => name.endsWith('-init'));
}

export async function stopCluster(): Promise<void> {
  // Never fail teardown: a stop error must not turn a green run red.
  //
  // Both halves matter. Killing the process makes merobox run its own graceful
  // shutdown; `stop --all` covers the case where this process is not the one
  // that started the cluster (a reused cluster, or a previous run's leftovers).
  if (clusterProcess && clusterProcess.exitCode === null) {
    clusterProcess.kill('SIGTERM');
  }
  clusterProcess = null;
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
 * `/auth/token` may simply not exist. **Only a 404 means that.** Every other
 * outcome — a 5xx, a timeout, an unparseable body — is a broken auth path, and
 * returning `null` for those would have the caller proceed unauthenticated:
 * the failure then resurfaces as anonymous 401s deep inside a test instead of
 * here, where the actual problem is.
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
    // No auth service in front of this node: nothing to mint, nothing wrong.
    if (res.status() === 404) return null;
    const text = await res.text();
    if (!res.ok()) {
      throw new Error(
        `${node.name}: POST /auth/token answered ${res.status()} — the node ` +
          `has an auth service but it is not usable: ${text.slice(0, 200)}`,
      );
    }
    // Guarded for the same reason every other branch here throws with
    // context: a 2xx carrying a non-JSON body (a proxy's HTML, a truncated
    // response) would otherwise be a bare SyntaxError, the one failure mode
    // this function does not explain.
    let body: { data?: { access_token?: string }; access_token?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        `${node.name}: /auth/token returned ${res.status()} with a non-JSON ` +
          `body: ${text.slice(0, 200)}`,
      );
    }
    const token = body.data?.access_token ?? body.access_token;
    if (!token) {
      throw new Error(
        `${node.name}: /auth/token returned no access_token: ${text.slice(0, 200)}`,
      );
    }
    return token;
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
