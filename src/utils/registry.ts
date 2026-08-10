/**
 * Registry client utility for fetching applications from configured registries
 */

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
    return bundlesArray.map((bundle: any) => ({
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      developer_pubkey: bundle.signature?.pubkey || 'unknown',
      latest_version: bundle.appVersion,
      latest_cid: bundle.wasm?.hash || bundle.wasm?.path || '',
      alias: bundle.metadata?.name,
      description: bundle.metadata?.description,
      author: bundle.metadata?.author,
      minRuntimeVersion: bundle.minRuntimeVersion,
      downloads: bundle.downloads ?? 0,
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
