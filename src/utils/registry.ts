/**
 * Registry client utility for fetching applications from configured registries
 */

/** The ten browse categories the registry enforces at upload. */
export const CATEGORIES = [
  'games',
  'productivity',
  'communication',
  'social',
  'art-design',
  'media',
  'planning',
  'security',
  'utilities',
  'developer-tools',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Work out which browse category a bundle belongs to.
 *
 * ⚠️ THE REGISTRY SERVES NO TOP-LEVEL `category` ON ANY BUNDLE TODAY (measured
 * against apps.calimero.network: 0 of 21), so reading one directly yields a card
 * that never shows a category. What bundles DO carry is `metadata.tags` (19 of
 * 21), and some of those tags are category names — `developer-tools` is in the
 * wild right now. So an explicit field wins when present, and otherwise the
 * first tag that names a real category is promoted. A tag that is not a
 * category ("multiplayer", "crdt") is left alone: it is a keyword, not a shelf.
 */
export function resolveCategory(
  explicit?: unknown,
  tags?: unknown,
): Category | undefined {
  const isCategory = (v: unknown): v is Category =>
    typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

  if (isCategory(explicit)) return explicit;
  if (Array.isArray(tags)) {
    const hit = tags.find(isCategory);
    if (hit) return hit;
  }
  return undefined;
}

export interface AppSummary {
  id: string;
  name: string;
  developer_pubkey: string;
  latest_version: string;
  latest_cid: string;
  alias?: string;
  description?: string;
  author?: string;
  downloads?: number;
  /**
   * `metadata.icon` — a `data:image/png;base64,…` URI carried inside the signed
   * bundle. The SAME field the desktop already passes to `create_desktop_shortcut`
   * for launcher icons, so it is known-good data that this listing was simply
   * throwing away.
   *
   * ⚠️ Absent on 3 of the 21 published bundles, so a fallback is a NORMAL state,
   * not an error state.
   */
  icon?: string | undefined;
  /**
   * An admin approved THIS PACKAGE. ⚠️ Not the publisher — see
   * `publisherVerified`. Two separate claims; do not render one value twice.
   */
  verified?: boolean | undefined;
  /** The account that published it is verified. */
  publisherVerified?: boolean | undefined;
  /**
   * Size of the `.mpk` in bytes, measured by the registry at upload.
   * ⚠️ `null` for every bundle published before the metadata policy shipped —
   * which today is ALL 21 of them. Render nothing, never `0 bytes`.
   */
  installSize?: number | null;
  /** ISO timestamp stamped at upload; null for all but one bundle today. */
  publishedAt?: string | null;
  tags?: string[] | undefined;
  /**
   * Resolved browse category. ⚠️ The registry does not serve a top-level
   * `category` on any bundle yet — it is derived from `metadata.category` when
   * present, else from a `tags` entry that names a category. Never read
   * `metadata.category` directly; use `resolveCategory`.
   */
  category?: Category | undefined;
  /** `links` — the app's own frontend, source and docs. Any may be absent. */
  links?: { frontend?: string; github?: string; docs?: string } | undefined;
  /**
   * The runtime this bundle demands.
   *
   * ⚠️ WORTH SURFACING, NOT JUST STORING. Core refuses to install a bundle
   * whose floor is above the node — "bundle requires runtime version
   * 0.11.0-rc.28 but current runtime is 0.11.0-rc.23" — and today the only way
   * a user learns that is by pressing Install and reading a toast.
   */
  minRuntimeVersion?: string | undefined;
  /**
   * The compiled module. ⚠️ ITS SIZE IS THE ONLY REAL SIZE THE REGISTRY
   * SERVES: `installSize` is null on all 21 published bundles while
   * `wasm.size` is populated on every one, so a size row that reads only
   * `installSize` never appears at all.
   */
  wasm?: { hash?: string; path?: string; size?: number } | undefined;
  /** The embedded ABI, when the bundle carries one. */
  abi?: { hash?: string; path?: string; size?: number } | undefined;
  signature?:
    | { algorithm?: string; publicKey?: string; signature?: string }
    | undefined;
  /** `did:key:…` of whoever signed the bundle. */
  signerId?: string | undefined;
}

export interface VersionInfo {
  semver: string;
  cid: string;
  yanked?: boolean;
}

export interface AppManifest {
  manifest_version: string;
  minRuntimeVersion: string;
  // V1 format fields
  id?: string;
  name?: string;
  version?: string | { semver: string }; // V1 (string) or V2 ({ semver: string })
  chains?: string[];
  artifact?: {
    type: string;
    target: string;
    digest?: string; // format: "sha256:..."
    uri: string;
  };
  // V2 format fields
  app?: {
    name: string;
    developer_pubkey: string;
    id: string;
    alias?: string;
  };
  supported_chains?: string[];
  permissions?: Array<{
    cap: string;
    bytes: number;
  }>;
  artifacts?: Array<{
    type: string;
    target: string;
    cid: string;
    size: number;
    mirrors?: string[];
    sha256?: string; // Optional hex hash
  }>;
  metadata?: {
    description?: string;
    author?: string;
    license?: string;
    [key: string]: any;
  };
  distribution?: string;
  signature?: {
    alg: string;
    sig: string;
    signed_at: string;
  };
}

/**
 * Fetch applications from a registry
 * Uses V2 Bundle API
 */
export async function fetchAppsFromRegistry(
  registryUrl: string,
  filters?: { dev?: string; name?: string },
): Promise<AppSummary[]> {
  try {
    const url = new URL('/api/v2/bundles', registryUrl);
    if (filters?.dev) {
      url.searchParams.set('developer', filters.dev);
    }
    if (filters?.name) {
      url.searchParams.set('package', filters.name);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Registry request failed: ${response.status} ${response.statusText}`,
      );
    }

    const bundles = await response.json();
    const bundlesArray = Array.isArray(bundles) ? bundles : [];

    // Transform V2 BundleManifest to AppSummary format
    // ⚠️ EVERY FIELD THE CARD NEEDS IS ALREADY ON THE WIRE. This mapper used to
    // keep six keys and drop the rest, which is the whole reason the marketplace
    // rendered a generic box glyph for every app while the registry — reading
    // the same endpoint — rendered real launcher icons.
    return bundlesArray.map((bundle: any) => ({
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      developer_pubkey: bundle.signature?.pubkey || 'unknown',
      latest_version: bundle.appVersion,
      latest_cid: bundle.wasm?.hash || bundle.wasm?.path || '',
      alias: bundle.metadata?.name,
      description: bundle.metadata?.description,
      author: bundle.metadata?.author,
      downloads: bundle.downloads ?? 0,
      icon: bundle.metadata?.icon,
      verified: bundle.verified === true,
      publisherVerified: bundle.publisherVerified === true,
      // `?? null`, not `|| undefined`: absent and zero are different answers and
      // the card renders nothing for the first.
      installSize: bundle.installSize ?? null,
      publishedAt: bundle.publishedAt ?? null,
      tags: Array.isArray(bundle.metadata?.tags) ? bundle.metadata.tags : [],
      category: resolveCategory(
        bundle.metadata?.category,
        bundle.metadata?.tags,
      ),
      links: bundle.links,
      minRuntimeVersion: bundle.minRuntimeVersion ?? bundle.min_runtime_version,
      wasm: bundle.wasm,
      abi: bundle.abi,
      signature: bundle.signature,
      signerId: bundle.signerId,
    }));
  } catch (error) {
    console.error(`Failed to fetch apps from registry ${registryUrl}:`, error);
    throw error;
  }
}

// Package ids may be scoped (@org/name) but nothing more — this mirrors the
// registry's own validation and blocks stray slashes / path-traversal. Both
// fetch helpers use it so the version list and manifest fetch agree.
const APP_ID_RE = /^(?:@[\w.-]+\/)?[\w.+-]+$/;
const VERSION_RE = /^[\w.+-]+$/;

/**
 * Compare two semver strings for a descending sort. Handles MAJOR.MINOR.PATCH
 * plus pre-release identifiers (1.0.0-alpha sorts below 1.0.0). Build metadata
 * (after '+') is ignored, per the semver spec.
 */
export function compareSemverDesc(a: string, b: string): number {
  const parse = (v: string) => {
    const withoutBuild = v.replace(/^v/, '').split('+')[0] ?? '';
    const dash = withoutBuild.indexOf('-');
    const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
    const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1);
    return { core: core.split('.').map(Number), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.core.length, pb.core.length); i++) {
    const diff = (pb.core[i] ?? 0) - (pa.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // Equal core: a release WITHOUT a pre-release outranks one WITH it.
  if (pa.pre === '' && pb.pre !== '') return -1;
  if (pa.pre !== '' && pb.pre === '') return 1;
  if (pa.pre === pb.pre) return 0;
  const ia = pa.pre.split('.');
  const ib = pb.pre.split('.');
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    const xa = ia[i];
    const xb = ib[i];
    if (xa === undefined) return 1; // shorter pre-release has lower precedence
    if (xb === undefined) return -1;
    const na = Number(xa);
    const nb = Number(xb);
    const aNum = !Number.isNaN(na);
    const bNum = !Number.isNaN(nb);
    if (aNum && bNum) {
      if (na !== nb) return nb - na;
    } else if (aNum !== bNum) {
      // numeric identifiers have lower precedence than alphanumeric ones
      return aNum ? 1 : -1;
    } else {
      const cmp = xb.localeCompare(xa);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Fetch all versions of an application from a registry
 * Uses V2 Bundle API
 */
export async function fetchAppVersions(
  registryUrl: string,
  appId: string,
): Promise<VersionInfo[]> {
  if (!APP_ID_RE.test(appId)) throw new Error(`Invalid appId: ${appId}`);
  try {
    // Use V2 Bundle API - get all published versions for this package
    const url = new URL('/api/v2/bundles', registryUrl);
    url.searchParams.set('package', appId); // encodeURIComponent handled by URLSearchParams
    url.searchParams.set('all_versions', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch versions: ${response.status} ${response.statusText}`,
      );
    }

    const bundles = await response.json();
    const bundlesArray = Array.isArray(bundles) ? bundles : [];

    // Drop yanked/invalid entries and deduplicate by semver (the registry may
    // return one entry per platform/arch), then sort newest-first.
    const seen = new Set<string>();
    const versions: VersionInfo[] = [];
    for (const bundle of bundlesArray as any[]) {
      const semver = bundle.appVersion as string;
      // Do not trust the server-side `?package=` filter. A registry, proxy or
      // cache that ignores it would otherwise have us offer versions belonging
      // to a DIFFERENT application, and installing one resolves an artifact URL
      // that does not exist for this package.
      if (bundle.package !== undefined && bundle.package !== appId) continue;
      if (!VERSION_RE.test(semver)) continue;
      if (bundle.yanked === true) continue;
      if (seen.has(semver)) continue;
      seen.add(semver);
      versions.push({
        semver,
        cid: `/artifacts/${bundle.package}/${semver}/${bundle.package}-${semver}.mpk`,
        yanked: false,
      });
    }
    return versions.sort((a, b) => compareSemverDesc(a.semver, b.semver));
  } catch (error) {
    console.error(
      `Failed to fetch app versions from registry ${registryUrl}:`,
      error,
    );
    throw error;
  }
}

/**
 * Fetch application manifest from a registry
 * Uses V2 Bundle API and transforms to AppManifest format
 */
export async function fetchAppManifest(
  registryUrl: string,
  appId: string,
  version: string,
): Promise<AppManifest> {
  if (!APP_ID_RE.test(appId)) throw new Error(`Invalid appId: ${appId}`);
  if (!VERSION_RE.test(version)) throw new Error(`Invalid version: ${version}`);
  try {
    // Use V2 Bundle API — encodeURIComponent guards against path traversal in segments
    const url = new URL(
      `/api/v2/bundles/${encodeURIComponent(appId)}/${encodeURIComponent(version)}`,
      registryUrl,
    );

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch manifest: ${response.status} ${response.statusText}`,
      );
    }

    const bundle = await response.json();

    // Transform V2 BundleManifest to AppManifest format
    // V2 bundles use MPK (Mero Package Kit) files, not raw WASM
    // Construct MPK URL: /artifacts/{package}/{version}/{package}-{version}.mpk
    const mpkUrl = `/artifacts/${bundle.package}/${bundle.appVersion}/${bundle.package}-${bundle.appVersion}.mpk`;
    // For absolute URL, we need to prepend the registry base URL
    const registryBase = new URL(registryUrl).origin;
    const mpkAbsoluteUrl = `${registryBase}${mpkUrl}`;
    const mpkHash = bundle.wasm?.hash || '';

    return {
      manifest_version: bundle.version || '2.0',
      app: {
        name: bundle.metadata?.name || bundle.package,
        developer_pubkey: bundle.signature?.pubkey || 'unknown',
        id: bundle.package,
        alias: bundle.metadata?.name,
      },
      minRuntimeVersion: bundle.minRuntimeVersion,
      version: {
        semver: bundle.appVersion,
      },
      supported_chains: [], // V2 bundles don't have chains in manifest
      permissions: [
        {
          cap: 'basic',
          bytes: bundle.wasm?.size || 0,
        },
      ],
      artifacts: [
        {
          type: 'mpk', // V2 bundles use MPK files
          target: 'node',
          cid: mpkHash, // Use hash as CID for compatibility
          size: bundle.wasm?.size || 0,
          mirrors: [mpkAbsoluteUrl], // MPK URL for download
          sha256: mpkHash, // Hash in hex format (without sha256: prefix)
        },
      ],
      metadata: {
        provides: bundle.interfaces?.exports || [],
        requires: bundle.interfaces?.uses || [],
        description: bundle.metadata?.description,
        tags: bundle.metadata?.tags,
        license: bundle.metadata?.license,
        links: bundle.links,
      },
      distribution: 'registry',
      signature: bundle.signature
        ? {
            alg: bundle.signature.alg,
            sig: bundle.signature.sig,
            signed_at: bundle.signature.signedAt,
          }
        : {
            alg: 'ed25519',
            sig: 'unsigned',
            signed_at: new Date().toISOString(),
          },
    };
  } catch (error) {
    console.error(
      `Failed to fetch app manifest from registry ${registryUrl}:`,
      error,
    );
    throw error;
  }
}

/**
 * Record a download with the registry (fire-and-forget).
 * Call after a successful app install so download counts stay accurate.
 * Never throws; logs warnings on invalid URL or fetch failure.
 */
export function recordDownload(
  registryBaseUrl: string,
  packageId: string,
  version: string,
): void {
  try {
    if (!registryBaseUrl?.startsWith('https://')) {
      console.warn(
        'recordDownload: registry URL should use HTTPS',
        registryBaseUrl,
      );
    }
    const recordUrl = new URL(
      '/api/v2/downloads/record',
      registryBaseUrl,
    ).toString();
    fetch(recordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageId, version }),
    }).catch((err) => {
      console.warn('Failed to record download:', err);
    });
  } catch (err) {
    console.warn(
      'Failed to record download (invalid URL or serialization):',
      err,
    );
  }
}

/**
 * Fetch applications from all configured registries
 */
export async function fetchAppsFromAllRegistries(
  registryUrls: string[],
  filters?: { dev?: string; name?: string },
): Promise<Array<{ registry: string; apps: AppSummary[] }>> {
  const results = await Promise.allSettled(
    registryUrls.map(async (url) => {
      const apps = await fetchAppsFromRegistry(url, filters);
      return { registry: url, apps };
    }),
  );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        registry: string;
        apps: AppSummary[];
      }> => result.status === 'fulfilled',
    )
    .map((result) => result.value);
}

/** One preview image the registry holds for a package. */
export interface PackageAsset {
  id?: string;
  url?: string;
  thumbnailUrl?: string;
  contentType?: string;
  alt?: string;
}

/**
 * Preview images for a package.
 *
 * ⚠️ EXPECT AN EMPTY LIST. Measured against apps.calimero.network: every one of
 * the published packages returns `assets: []` today — the asset bucket is still
 * open infrastructure work (plan.MD item 4). So the caller must render an
 * honest "no preview" state rather than an empty region, and a 404 from an
 * older registry is an empty list, not an error worth surfacing.
 */
export async function fetchPackageAssets(
  registryUrl: string,
  packageId: string,
): Promise<PackageAsset[]> {
  if (!APP_ID_RE.test(packageId)) return [];
  try {
    const url = new URL(
      `/api/v2/packages/${encodeURIComponent(packageId)}/assets`,
      registryUrl,
    );
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.assets) ? body.assets : [];
  } catch {
    return [];
  }
}
