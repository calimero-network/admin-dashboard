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

const CORE_REPO = 'calimero-network/core';
// Keep this in step with the API surface the dashboard targets. rc.23 deleted
// `GET /namespaces/:id/identity` and dropped `selfIdentity` from the member
// list, so a suite still pinned to rc.20 would keep passing against shapes the
// node no longer sends — which is precisely how 1.13.0 shipped broken.
// The cache key in .github/workflows/ci.yml names this version too.
//
// ⚠️ THE PIN ALSO HAS TO CLEAR WHAT THE REGISTRY PUBLISHES. The live suite
// installs a REAL bundle from apps.calimero.network, and core refuses a bundle
// whose `minRuntimeVersion` is newer than the node:
//
//   Failed to install: bundle requires runtime version 0.11.0-rc.28
//                      but current runtime is 0.11.0-rc.23
//
// com.calimero.chat was republished at 3.1.1 / rc.28, which red-lined this leg
// on every branch from 2026-08-18 onward — including a dependabot PR that
// touched one devDependency. A bundle can be republished at any time, so this
// pin is a floor that moves with the fleet, not a value that can be set once.
//
// ⚠️ AND A CEILING: rc.31 IS AS FAR AS THIS CAN GO TODAY. rc.31 made the admin
// install route take COORDINATES and nothing else, so the url-based call the
// dashboard's client makes is rejected outright:
//
//   unknown field `url`, expected `package` or `version`
//
// @calimero-network/calimero-client is already on its newest published build
// (1.25.0-beta.2) and still posts { url, metadata, hash }, so there is no
// client release that speaks rc.31+ yet. rc.30 is therefore the newest core
// the dashboard can actually drive. Measured, not guessed — the live suite is
// green on rc.28/29/30 and fails install on rc.31/32/33.
const MEROD_VERSION = process.env['MEROD_VERSION'] ?? '0.11.0-rc.30';

const rootDir = path.resolve(import.meta.dirname, '..');
const binDir = path.join(rootDir, '.merod');
const binaryPath = path.join(binDir, 'merod');

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

async function main() {
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
  await fs.writeFile(archivePath, Buffer.from(await dl.arrayBuffer()));

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

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
