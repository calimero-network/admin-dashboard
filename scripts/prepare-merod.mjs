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
const MEROD_VERSION = process.env['MEROD_VERSION'] ?? '0.11.0-rc.20';

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

async function main() {
  if (existsSync(binaryPath) && !process.env['MEROD_FORCE_DOWNLOAD']) {
    const version = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf8',
    }).trim();
    console.log(`merod already present: ${version}`);
    return;
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

  // Archives may nest the binary or name it after the target triple.
  if (!existsSync(binaryPath)) {
    const entries = await fs.readdir(binDir, { withFileTypes: true });
    const found = entries.find((e) => e.isFile() && e.name.startsWith('merod'));
    if (!found) {
      throw new Error(
        `Extracted archive contains no merod binary: ${entries.map((e) => e.name).join(', ')}`,
      );
    }
    await fs.rename(path.join(binDir, found.name), binaryPath);
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
