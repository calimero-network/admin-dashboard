/**
 * A minimal app registry for the live e2e suite.
 *
 * It exists so the Marketplace's READ paths — listing, search, filter pills, the
 * version picker — can be asserted deterministically, instead of pinning them to
 * whatever happens to be published on apps.calimero.network today.
 *
 * It deliberately does NOT serve installs, and cannot: core refuses install URLs
 * whose host is loopback or private (an SSRF control in
 * crates/server/primitives/src/validation.rs, re-applied at fetch time to cover
 * redirects), so a node asked to install from here answers
 * 400 "URL host is a loopback, private, link-local, or otherwise non-public
 * address". The one install test therefore uses the public registry.
 *
 * The artifact below is still served so the manifest is internally consistent: a
 * minimal valid wasm module, with a real sha256 so the dashboard's hex -> base58
 * conversion has something true to work on.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env['LIVE_REGISTRY_PORT'] ?? '4600');

export const PACKAGE = 'com.calimero.e2eprobe';
export const VERSION = '1.4.2';
export const APP_NAME = 'E2E Probe';
export const APP_DESCRIPTION = 'Deterministic fixture app for live e2e runs.';

/** `\0asm` + version 1 — the smallest valid WebAssembly module. */
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const WASM_SHA256 = crypto.createHash('sha256').update(WASM).digest('hex');

const origin = `http://localhost:${PORT}`;
const artifactPath = `/artifacts/${PACKAGE}/${VERSION}/${PACKAGE}-${VERSION}.wasm`;

const bundle = {
  package: PACKAGE,
  appVersion: VERSION,
  minRuntimeVersion: '0.1.0',
  metadata: {
    name: APP_NAME,
    description: APP_DESCRIPTION,
    author: 'Calimero E2E',
  },
  // A real digest, so the dashboard's hex -> base58 conversion and the node's
  // download-time hash check are both genuinely exercised.
  artifacts: [
    {
      type: 'wasm',
      target: 'wasm32-unknown-unknown',
      cid: WASM_SHA256,
      size: WASM.length,
      sha256: WASM_SHA256,
      mirrors: [`${origin}${artifactPath}`],
    },
  ],
  downloads: 7,
};

/** An older version, so the detail modal's version picker has a real choice. */
const olderBundle = { ...bundle, appVersion: '1.0.0' };

const json = (res, body, status = 200) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  // Health, for Playwright's webServer readiness probe.
  if (url.pathname === '/health') return json(res, { status: 'ok' });

  // GET /api/v2/bundles — a BARE ARRAY, matching the real registry.
  if (url.pathname === '/api/v2/bundles') {
    const pkg = url.searchParams.get('package');
    const all = url.searchParams.get('all_versions') === 'true';
    if (pkg && pkg !== PACKAGE) return json(res, []);
    return json(res, all ? [bundle, olderBundle] : [bundle]);
  }

  // GET /api/v2/bundles/:package/:version — the manifest.
  const manifestMatch = /^\/api\/v2\/bundles\/([^/]+)\/([^/]+)$/.exec(
    url.pathname,
  );
  if (manifestMatch) {
    const [, pkg, ver] = manifestMatch;
    if (decodeURIComponent(pkg) !== PACKAGE) {
      return json(res, { error: 'not_found' }, 404);
    }
    return json(res, { ...bundle, appVersion: decodeURIComponent(ver) });
  }

  if (url.pathname === artifactPath) {
    res.writeHead(200, {
      'Content-Type': 'application/wasm',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': WASM.length,
    });
    return res.end(WASM);
  }

  if (url.pathname === '/api/v2/downloads/record')
    return json(res, { ok: true });

  return json(res, { error: 'not_found', path: url.pathname }, 404);
});

server.listen(PORT, () => {
  console.log(`[live-registry] ${origin} serving ${PACKAGE}@${VERSION}`);
  console.log(`[live-registry] artifact sha256=${WASM_SHA256}`);
});

const close = () => server.close(() => process.exit(0));
process.on('SIGTERM', close);
process.on('SIGINT', close);
