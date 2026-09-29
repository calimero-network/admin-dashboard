/**
 * A minimal app registry for the live e2e suite — and the live NODE's registry.
 *
 * Two jobs:
 *   1. The Marketplace READ paths — listing, search, filter pills, the version
 *      picker — asserted against a deterministic listing (the E2E Probe),
 *      instead of whatever is published on apps.calimero.network today.
 *   2. INSTALLS. Since core rc.31 a node installs `package@version` from its own
 *      `[registry] base_url`, fetching
 *      `{base}/artifacts/{pkg}/{ver}/{pkg}-{ver}.mpk` with no host guard (it is
 *      operator config). scripts/live-node.mjs points the node here, so the
 *      install test goes Marketplace -> node -> this server, never the public
 *      registry. It serves one real bundle, Mero Chat, from the sha256-pinned
 *      copy prepare-merod.mjs downloads (scripts/live-fixtures.mjs), and counts
 *      artifact downloads at /__stats so a test can prove the node fetched from
 *      its configured registry.
 *
 * The probe has no `.mpk`: it is listing-only, so installing it would be the
 * node's 502 "not published", which nothing asserts on.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { FIXTURES, FIXTURES_DIR } from './live-fixtures.mjs';

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

/**
 * Read one file out of a gzipped tar (a `.mpk`). ustar only, which is what
 * cargo-mero writes; enough for the manifest, with no dependency.
 */
function readFromTarGz(buf, wanted) {
  const tar = zlib.gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(
      header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() ||
        '0',
      8,
    );
    const body = tar.subarray(off + 512, off + 512 + size);
    if (name.replace(/^\.\//, '') === wanted) return body;
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** The pinned Mero Chat bundle, or null when prepare-merod.mjs has not run. */
function loadChat() {
  const file = path.join(FIXTURES_DIR, FIXTURES.chat.file);
  if (!fs.existsSync(file)) {
    console.warn(
      `[live-registry] ${file} missing — run \`pnpm merod:prepare\`. Serving without it.`,
    );
    return null;
  }
  const bytes = fs.readFileSync(file);
  const manifestBytes = readFromTarGz(bytes, 'manifest.json');
  if (!manifestBytes) throw new Error(`${file} has no manifest.json`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  // The listing shape the real registry answers with: the manifest minus the
  // payload descriptors and the signature.
  const { signature: _s, wasm: _w, abi: _a, ...listing } = manifest;
  return {
    bytes,
    listing: { ...listing, downloads: 3 },
    artifactPath: `/artifacts/${manifest.package}/${manifest.appVersion}/${manifest.package}-${manifest.appVersion}.mpk`,
  };
}

const chat = loadChat();
const downloads = {};

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

  // What the node fetched, for tests that must prove the install came from here.
  if (url.pathname === '/__stats') return json(res, { downloads });

  // GET /api/v2/bundles — a BARE ARRAY, matching the real registry.
  if (url.pathname === '/api/v2/bundles') {
    const pkg = url.searchParams.get('package');
    const all = url.searchParams.get('all_versions') === 'true';
    if (chat && pkg === chat.listing.package) return json(res, [chat.listing]);
    if (pkg && pkg !== PACKAGE) return json(res, []);
    if (pkg) return json(res, all ? [bundle, olderBundle] : [bundle]);
    return json(res, chat ? [bundle, chat.listing] : [bundle]);
  }

  // GET /api/v2/bundles/:package/:version — the manifest.
  const manifestMatch = /^\/api\/v2\/bundles\/([^/]+)\/([^/]+)$/.exec(
    url.pathname,
  );
  if (manifestMatch) {
    const [, pkg, ver] = manifestMatch;
    if (
      chat &&
      decodeURIComponent(pkg) === chat.listing.package &&
      decodeURIComponent(ver) === chat.listing.appVersion
    ) {
      return json(res, chat.listing);
    }
    if (decodeURIComponent(pkg) !== PACKAGE) {
      return json(res, { error: 'not_found' }, 404);
    }
    return json(res, { ...bundle, appVersion: decodeURIComponent(ver) });
  }

  if (chat && url.pathname === chat.artifactPath) {
    downloads[url.pathname] = (downloads[url.pathname] ?? 0) + 1;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': chat.bytes.length,
    });
    return res.end(chat.bytes);
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
  if (chat) {
    console.log(
      `[live-registry] and ${chat.listing.package}@${chat.listing.appVersion} at ${chat.artifactPath}`,
    );
  }
  console.log(`[live-registry] artifact sha256=${WASM_SHA256}`);
});

const close = () => server.close(() => process.exit(0));
process.on('SIGTERM', close);
process.on('SIGINT', close);
