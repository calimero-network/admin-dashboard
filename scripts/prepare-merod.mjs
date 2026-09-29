/**
 * Download the `merod` binary for this platform from a calimero-network/core
 * release, so the live e2e suite can run a real node.
 *
 * Pinned deliberately: the suite asserts behaviour of a specific runtime, and a
 * moving "latest" would turn an unrelated core change into a red CI run here.
 * Override with MEROD_VERSION when testing against a different release.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { FIXTURES } from './live-fixtures.mjs';

const CORE_REPO = 'calimero-network/core';
// Keep this in step with the API surface the dashboard targets. rc.23 deleted
// `GET /namespaces/:id/identity` and dropped `selfIdentity` from the member
// list, so a suite still pinned to rc.20 would keep passing against shapes the
// node no longer sends — which is precisely how 1.13.0 shipped broken.
// The cache key in .github/workflows/ci.yml names this version too.
//
const MEROD_VERSION = process.env['MEROD_VERSION'] ?? '0.11.0-rc.62';

const PINNED_SHA256 = {
  '0.11.0-rc.62': {
    'merod_aarch64-apple-darwin.tar.gz':
      '210956a74539fc3518ca44d33173432d10e9a804e7c30c374d0b53a4377ed778',
    'merod_aarch64-unknown-linux-gnu.tar.gz':
      '78c4ff12c2022c22ba312436e5d933eb9e6a7187ec65012bd47d29792d7597e0',
    'merod_x86_64-unknown-linux-gnu.tar.gz':
      'fbbbc49a8fe3939c50b1ddb9f4d2ce6bdeeef0b183e2e8f11604b2b5e60638e7',
  },
  '0.11.0-rc.30': {
    'merod_aarch64-apple-darwin.tar.gz':
      'aa5b2bb9dd2956b8995b2a6201441a462f40f96e1a5c2bcd4e923f166744ee67',
    'merod_aarch64-unknown-linux-gnu.tar.gz':
      '359bf7da0e573a6d32ef0d6c57f85bec3b6c67277224cc8a48c6406467737b60',
    'merod_x86_64-unknown-linux-gnu.tar.gz':
      '926d2bbb6333792673325cfd3a84db0460aceed722db1a000f268e5aa223e8fb',
  },
};

function expectedSha256(assetName, asset) {
  const pinned = PINNED_SHA256[MEROD_VERSION]?.[assetName];
  if (pinned) return pinned;
  const reported = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1];
  if (reported) return reported;
  throw new Error(
    `No sha256 to verify ${assetName} (${MEROD_VERSION}) against: not pinned ` +
      'here and GitHub reports no digest for it. Refusing to run it unverified.',
  );
}

const rootDir = path.resolve(import.meta.dirname, '..');
const binDir = path.join(rootDir, '.merod');
const binaryPath = path.join(binDir, 'merod');
const fixturesDir = path.join(binDir, 'fixtures');

/** Release asset suffix for the host platform. */
function assetSuffix() {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu';
  if (platform === 'linux' && arch === 'arm64')
    return 'aarch64-unknown-linux-gnu';
  throw new Error(
    `No merod release asset for ${platform}/${arch}. core does not publish one; ` +
      'run the live suite on linux-x64, linux-arm64 or macOS.',
  );
}

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'admin-dashboard-live-e2e',
  };
  // Unauthenticated GitHub API is 60 req/h per IP, which shared CI runners
  // exhaust; the token raises it to 5000.
  const token = process.env['GITHUB_TOKEN'];
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Depth-first search for the extracted `merod` executable. */
async function findBinary(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.startsWith('merod')) return full;
    if (entry.isDirectory()) {
      const nested = await findBinary(full);
      if (nested) return nested;
    }
  }
  return null;
}

async function ensureMerod() {
  if (existsSync(binaryPath) && !process.env['MEROD_FORCE_DOWNLOAD']) {
    const version = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf8',
    }).trim();
    // ⚠️ THE CACHED BINARY HAS TO BE THE PINNED ONE. This used to accept
    // whatever was in .merod and print "already present", so bumping
    // MEROD_VERSION changed nothing locally: the suite kept running the old
    // node and the bump looked like it had worked. CI is shielded by a cache
    // key that names the version; a developer's working copy is not.
    if (version.includes(MEROD_VERSION)) {
      console.log(`merod already present: ${version}`);
      return;
    }
    console.log(
      `merod at ${binaryPath} is ${version}, want ${MEROD_VERSION} — re-downloading.`,
    );
    await fs.rm(binDir, { recursive: true, force: true });
  }

  const suffix = assetSuffix();
  const assetName = `merod_${suffix}.tar.gz`;
  const releaseUrl = `https://api.github.com/repos/${CORE_REPO}/releases/tags/${encodeURIComponent(MEROD_VERSION)}`;

  console.log(`Fetching release ${MEROD_VERSION}…`);
  const releaseRes = await fetch(releaseUrl, { headers: headers() });
  if (!releaseRes.ok) {
    throw new Error(
      `GitHub returned ${releaseRes.status} for ${MEROD_VERSION}. ` +
        `Check the tag exists and, in CI, that GITHUB_TOKEN is set.`,
    );
  }
  const release = await releaseRes.json();
  const asset = release.assets?.find((a) => a.name === assetName);
  if (!asset) {
    const names = (release.assets ?? []).map((a) => a.name).join(', ');
    throw new Error(
      `Asset ${assetName} not found in ${MEROD_VERSION}. Available: ${names || 'none'}`,
    );
  }

  await fs.mkdir(binDir, { recursive: true });
  const archivePath = path.join(binDir, assetName);

  console.log(`Downloading ${assetName} (${asset.size} bytes)…`);
  // The asset download needs the octet-stream Accept header, not the JSON one.
  const dl = await fetch(asset.url, {
    headers: { ...headers(), Accept: 'application/octet-stream' },
    redirect: 'follow',
  });
  if (!dl.ok) throw new Error(`Asset download failed: ${dl.status}`);
  const archive = Buffer.from(await dl.arrayBuffer());

  const expected = expectedSha256(assetName, asset);
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `${assetName} sha256 mismatch: expected ${expected}, got ${actual}. ` +
        'Not extracting it.',
    );
  }
  console.log(`Verified ${assetName} sha256 ${actual}`);

  await fs.writeFile(archivePath, archive);

  execFileSync('tar', ['-xzf', archivePath, '-C', binDir], {
    stdio: 'inherit',
  });
  await fs.rm(archivePath, { force: true });

  // Archives may nest the binary or name it after the target triple. The
  // search has to RECURSE to honour the first half of that: a tarball that
  // extracts to `merod-x86_64-apple-darwin/merod` puts a directory at the top
  // level, and a files-only scan of that level finds nothing and throws
  // "contains no merod binary" while the binary sits one level down.
  if (!existsSync(binaryPath)) {
    const found = await findBinary(binDir);
    if (!found) {
      const entries = await fs.readdir(binDir);
      throw new Error(
        `Extracted archive contains no merod binary: ${entries.join(', ')}`,
      );
    }
    await fs.rename(found, binaryPath);
  }

  await fs.chmod(binaryPath, 0o755);
  const version = execFileSync(binaryPath, ['--version'], {
    encoding: 'utf8',
  }).trim();
  console.log(`merod ready: ${version} -> ${binaryPath}`);
}

async function ensureFixture(name, url, sha256) {
  await fs.mkdir(fixturesDir, { recursive: true });
  const dest = path.join(fixturesDir, name);
  if (existsSync(dest)) {
    const have = createHash('sha256')
      .update(await fs.readFile(dest))
      .digest('hex');
    if (have === sha256) {
      console.log(`fixture ${name} already present`);
      return;
    }
  }
  console.log(`Downloading fixture ${name}…`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok)
    throw new Error(`Fixture ${name}: HTTP ${res.status} from ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) {
    throw new Error(
      `Fixture ${name} sha256 mismatch: expected ${sha256}, got ${actual}.`,
    );
  }
  await fs.writeFile(dest, bytes);
  console.log(`Verified fixture ${name} sha256 ${actual}`);
}

async function ensureFixtures() {
  const kvSha = FIXTURES.kvStore.sha256[MEROD_VERSION];
  if (!kvSha) {
    throw new Error(
      `No pinned kv-store fixture sha256 for ${MEROD_VERSION}; add it to FIXTURES.`,
    );
  }
  await ensureFixture(
    FIXTURES.kvStore.file,
    FIXTURES.kvStore.url(MEROD_VERSION),
    kvSha,
  );
  await ensureFixture(
    FIXTURES.chat.file,
    FIXTURES.chat.url(),
    FIXTURES.chat.sha256,
  );
}

async function main() {
  await ensureMerod();
  await ensureFixtures();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
