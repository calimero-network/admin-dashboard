/**
 * Installing a registry bundle onto the node.
 *
 * Lifted out of `pages/Marketplace.tsx` when the detail modal became a real
 * page: two surfaces now offer an Install button, and a second copy of this
 * would be a second place for the artifact/hash rules below to drift.
 */

import { apiClient } from '@calimero-network/calimero-client';
import bs58 from 'bs58';
import {
  fetchAppManifest,
  recordDownload,
  type AppManifest,
  type AppSummary,
} from './registry';

/**
 * Resolve the artifact to install from a registry manifest.
 *
 * Handles v1 (`artifact`), v2 (`artifacts[]`, preferring `mpk` over `wasm`), and
 * the by-convention fallback for v2 bundle records that carry no artifacts block
 * at all — the last of which the pre-port dashboard relied on and the desktop
 * does not implement.
 */
export function resolveArtifact(
  manifest: AppManifest,
  registryUrl: string,
  packageId: string,
  version: string,
): { url: string; hashHex: string | null } {
  const strip = (s: string | undefined | null) =>
    s ? s.replace('sha256:', '') : null;

  if (manifest.artifact) {
    if (!manifest.artifact.uri) {
      throw new Error('Invalid manifest: artifact URI is missing');
    }
    return {
      url: manifest.artifact.uri,
      hashHex: strip(manifest.artifact.digest),
    };
  }

  if (manifest.artifacts && manifest.artifacts.length > 0) {
    const mpk = manifest.artifacts.find((a) => a.type === 'mpk');
    const wasm = manifest.artifacts.find((a) => a.type === 'wasm');
    const chosen = mpk ?? wasm;
    if (!chosen) {
      throw new Error('No MPK or WASM artifact found in application manifest');
    }
    const url =
      chosen.mirrors?.[0] ?? `https://ipfs.io/ipfs/${chosen.cid ?? ''}`;
    let hashHex = strip(chosen.sha256);
    // Some registries put a plain hex digest in `cid`.
    if (!hashHex && chosen.cid && /^[0-9a-f]{64}$/i.test(chosen.cid)) {
      hashHex = chosen.cid;
    }
    return { url, hashHex };
  }

  // Registry v2 bundles with no artifacts block: build the MPK URL by
  // convention — /artifacts/{package}/{version}/{package}-{version}.mpk
  const base = registryUrl.replace(/\/+$/, '');
  const p = encodeURIComponent(packageId);
  const v = encodeURIComponent(version);
  return {
    url: `${base}/artifacts/${p}/${v}/${p}-${v}.mpk`,
    hashHex: null,
  };
}

/**
 * Convert a 64-char hex digest to the base58 the node expects.
 *
 * The character check is load-bearing, not defensive noise: `parseInt` answers
 * `NaN` for a non-hex pair and `Uint8Array.from` coerces that to 0 WITHOUT
 * throwing, so a malformed digest would encode cleanly into a hash that simply
 * isn't the artifact's. Better to send no hash — and skip the integrity check —
 * than to send a confidently wrong one.
 */
export function hexToBase58(hashHex: string | null): string | undefined {
  if (!hashHex || !/^[0-9a-f]{64}$/i.test(hashHex)) return undefined;
  const pairs = hashHex.match(/.{2}/g);
  if (!pairs) return undefined;
  return bs58.encode(Uint8Array.from(pairs.map((b) => parseInt(b, 16))));
}

/**
 * Download and install one version of a package onto the connected node.
 *
 * Throws on failure; the caller decides how to surface it.
 */
export async function installApplication(
  app: AppSummary & { registry: string },
  version: string,
): Promise<void> {
  if (!/^[\w.+-]+$/.test(version)) {
    throw new Error('Invalid version string');
  }

  const manifest = await fetchAppManifest(app.registry, app.id, version);
  const { url, hashHex } = resolveArtifact(
    manifest,
    app.registry,
    app.id,
    version,
  );

  const isBundle = url.endsWith('.mpk');
  // Bundles carry their own manifest metadata and the node prefers it, so we
  // send empty metadata; raw wasm has none, so we synthesise it.
  const metadata = isBundle
    ? new Uint8Array(0)
    : new TextEncoder().encode(
        JSON.stringify({
          name: app.name,
          description: manifest.metadata?.description ?? app.description ?? '',
          version,
          author: app.author ?? app.developer_pubkey ?? '',
        }),
      );
  // Only send a hash we know matches the file being downloaded. For bundles the
  // registry digest covers the wasm, not the .mpk, so the node computes it
  // during download instead.
  const hash = isBundle ? undefined : hexToBase58(hashHex);

  const res = await apiClient.node().installApplication(url, metadata, hash);
  if (res.error) throw new Error(res.error.message);

  recordDownload(app.registry, app.id, version);
}

/** The registry's own web page for a package, for "View on Registry". */
export function registryAppUrl(registry: string, packageId: string): string {
  const base = (() => {
    try {
      return new URL(registry).origin;
    } catch {
      return registry.replace(/\/+$/, '');
    }
  })();
  return `${base}/apps/${encodeURIComponent(packageId)}`;
}
