import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { apiClient } from '@calimero-network/calimero-client';
import bs58 from 'bs58';
import {
  Search,
  RefreshCw,
  Package,
  Download,
  CheckCircle2,
  X,
  ExternalLink,
} from 'lucide-react';
import Skeleton from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import {
  fetchAppsFromAllRegistries,
  fetchAppVersions,
  fetchAppManifest,
  recordDownload,
  type AppSummary,
  type VersionInfo,
  type AppManifest,
} from '../utils/registry';
import {
  getMarketplaceCache,
  setMarketplaceCache,
  touchMarketplaceCache,
  invalidateMarketplaceCache,
} from '../utils/marketplaceCache';
import { decodeMetadata, parseApiError } from '../utils/appUtils';
import { openExternal } from '../utils/openApp';
import './Marketplace.css';

interface MarketplaceApp extends AppSummary {
  registry: string;
  installed?: boolean;
}

type InstalledFilter = 'all' | 'installed' | 'not-installed';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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
 * isn't the artifact's. Better to send no hash — and skip the integrity check
 * — than to send a confidently wrong one.
 */
export function hexToBase58(hashHex: string | null): string | undefined {
  if (!hashHex || !/^[0-9a-f]{64}$/i.test(hashHex)) return undefined;
  const pairs = hashHex.match(/.{2}/g);
  if (!pairs) return undefined;
  return bs58.encode(Uint8Array.from(pairs.map((b) => parseInt(b, 16))));
}

export default function Marketplace() {
  const toast = useToast();
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [filterInstalled, setFilterInstalled] =
    useState<InstalledFilter>('all');
  const [installingAppId, setInstallingAppId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<MarketplaceApp | null>(null);
  const [availableVersions, setAvailableVersions] = useState<VersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [versionsLoading, setVersionsLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const buildApps = useCallback(
    (
      results: { registry: string; apps: AppSummary[] }[],
      installed: Set<string>,
    ): MarketplaceApp[] =>
      results.flatMap(({ registry, apps: registryApps }) =>
        registryApps.map((app) => ({
          ...app,
          registry,
          installed: installed.has(app.name) || installed.has(app.id),
        })),
      ),
    [],
  );

  /**
   * The node-assigned application id is a hash and never matches a registry
   * package id, so installed-state is correlated by the name/package recorded in
   * the app's metadata.
   */
  const loadInstalled = useCallback(async (): Promise<Set<string>> => {
    try {
      const res = await apiClient.node().getInstalledApplications();
      const raw = res.data as
        | { apps?: unknown[]; data?: { apps?: unknown[] } }
        | undefined;
      const list = raw?.data?.apps ?? raw?.apps ?? [];
      const names = new Set<string>();
      for (const entry of list as {
        metadata?: number[] | string;
        source?: string;
      }[]) {
        const meta = decodeMetadata(entry.metadata);
        if (meta?.name) names.add(meta.name);
        if (meta?.package) names.add(meta.package);
        if (entry.source) names.add(entry.source);
      }
      if (mounted.current) setInstalledNames(names);
      return names;
    } catch {
      return new Set();
    }
  }, []);

  const load = useCallback(
    async (installed: Set<string>, forceRefresh = false) => {
      const registries = getSettings().registries;
      if (registries.length === 0) {
        setError('No registries configured. Add one in Settings → Registries.');
        return;
      }

      // Serve from cache first for an instant list, then revalidate in the
      // background when the entry is stale.
      if (!forceRefresh) {
        const cached = getMarketplaceCache(registries);
        if (cached) {
          if (mounted.current) {
            setApps(buildApps(cached.results, installed));
            setError(null);
          }
          if (cached.isStale) {
            if (mounted.current) setRefreshing(true);
            try {
              const fresh = await fetchAppsFromAllRegistries(registries);
              setMarketplaceCache(registries, fresh);
              if (mounted.current) setApps(buildApps(fresh, installed));
            } catch {
              // Cached data is still serviceable; bump the timestamp so we do
              // not retry on every render.
              touchMarketplaceCache();
            } finally {
              if (mounted.current) setRefreshing(false);
            }
          }
          return;
        }
      }

      if (mounted.current) {
        setLoading(true);
        setError(null);
      }
      try {
        const results = await fetchAppsFromAllRegistries(registries);
        setMarketplaceCache(registries, results);
        if (mounted.current) setApps(buildApps(results, installed));
      } catch (e) {
        if (mounted.current) setError(parseApiError(e));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [buildApps],
  );

  useEffect(() => {
    void (async () => {
      const installed = await loadInstalled();
      await load(installed);
    })();
    // Intentionally once on mount; refresh is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-derive installed flags without refetching the registry.
  useEffect(() => {
    setApps((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.map((app) => ({
        ...app,
        installed: installedNames.has(app.name) || installedNames.has(app.id),
      }));
      return next.some((a, i) => a.installed !== prev[i]?.installed)
        ? next
        : prev;
    });
  }, [installedNames]);

  // Load the open app's published versions; default to the newest non-yanked.
  // Keyed on id+registry so flipping `installed` does not reset the user's pick.
  const selectedId = selectedApp?.id;
  const selectedRegistry = selectedApp?.registry;
  const selectedLatest = selectedApp?.latest_version;
  useEffect(() => {
    if (!selectedId || !selectedRegistry) {
      setAvailableVersions([]);
      setSelectedVersion('');
      setVersionsLoading(false);
      return;
    }
    let cancelled = false;
    setAvailableVersions([]);
    setSelectedVersion(selectedLatest ?? '');
    setVersionsLoading(true);
    fetchAppVersions(selectedRegistry, selectedId)
      .then((versions) => {
        if (cancelled) return;
        setAvailableVersions(versions);
        setSelectedVersion(versions[0]?.semver ?? selectedLatest ?? '');
        setVersionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableVersions([]);
        setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedRegistry, selectedLatest]);

  const handleForceRefresh = useCallback(async () => {
    invalidateMarketplaceCache();
    const installed = await loadInstalled();
    await load(installed, true);
  }, [load, loadInstalled]);

  const filteredApps = useMemo(() => {
    let out = apps;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((app) =>
        [
          app.alias ?? app.name,
          app.description ?? '',
          app.id,
          app.author ?? app.developer_pubkey ?? '',
        ].some((field) => field.toLowerCase().includes(q)),
      );
    }
    if (filterInstalled === 'installed') out = out.filter((a) => a.installed);
    if (filterInstalled === 'not-installed')
      out = out.filter((a) => !a.installed);
    return [...out].sort((a, b) =>
      (a.alias ?? a.name).localeCompare(b.alias ?? b.name),
    );
  }, [apps, filterInstalled, searchQuery]);

  const handleInstall = async (app: MarketplaceApp, version: string) => {
    if (!/^[\w.+-]+$/.test(version)) {
      toast.error('Invalid version string');
      return;
    }
    setInstallingAppId(app.id);
    try {
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
              description:
                manifest.metadata?.description ?? app.description ?? '',
              version,
              author: app.author ?? app.developer_pubkey ?? '',
            }),
          );
      // Only send a hash we know matches the file being downloaded. For bundles
      // the registry digest covers the wasm, not the .mpk, so the node computes
      // it during download instead.
      const hash = isBundle ? undefined : hexToBase58(hashHex);

      const res = await apiClient
        .node()
        .installApplication(url, metadata, hash);
      if (res.error) throw new Error(res.error.message);

      toast.success(`${app.alias ?? app.name} installed`);
      recordDownload(app.registry, app.id, version);
      await loadInstalled();
      setSelectedApp((prev) =>
        prev?.id === app.id ? { ...prev, installed: true } : prev,
      );
    } catch (e) {
      toast.error(`Failed to install: ${truncate(parseApiError(e), 120)}`);
    } finally {
      setInstallingAppId(null);
    }
  };

  const registryOrigin = useMemo(() => {
    const first = getSettings().registries[0];
    if (!first) return null;
    try {
      return new URL(first).origin;
    } catch {
      return first.replace(/\/+$/, '');
    }
  }, []);

  return (
    <div className="marketplace-page">
      <header className="marketplace-header">
        <h1>Application Marketplace</h1>
        <div className="marketplace-header-row">
          <p>Browse and install applications from configured registries</p>
          {registryOrigin && (
            <button
              className="explore-registry-btn"
              onClick={() => openExternal(registryOrigin)}
            >
              <ExternalLink size={13} />
              Explore Registry on web
            </button>
          )}
        </div>
      </header>

      <main className="marketplace-main">
        <div className="marketplace-controls">
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              data-testid="marketplace-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="search-clear"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="marketplace-filters">
            <div className="filter-pills">
              {(['all', 'installed', 'not-installed'] as const).map((f) => (
                <button
                  key={f}
                  className={`filter-pill${filterInstalled === f ? ' active' : ''}`}
                  onClick={() => setFilterInstalled(f)}
                >
                  {f === 'all'
                    ? 'All'
                    : f === 'installed'
                      ? 'Installed'
                      : 'Not Installed'}
                </button>
              ))}
            </div>
            <button
              onClick={() => void handleForceRefresh()}
              className="refresh-btn"
              disabled={loading || refreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw
                size={15}
                className={loading || refreshing ? 'spinning' : ''}
              />
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="apps-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="app-card skeleton-card">
                <div className="app-card-header">
                  <Skeleton
                    variant="rectangular"
                    width="40px"
                    height="40px"
                    borderRadius="10px"
                  />
                  <div className="app-title-section">
                    <Skeleton variant="text" width="70%" height="16px" />
                    <Skeleton variant="text" width="40%" height="12px" />
                  </div>
                </div>
                <div className="app-card-description">
                  <Skeleton variant="text" width="100%" height="13px" />
                </div>
                <div className="app-card-actions">
                  <Skeleton
                    variant="rectangular"
                    width="100%"
                    height="38px"
                    borderRadius="10px"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="empty-state">
            <Package size={48} className="empty-icon" />
            <h3>No applications found</h3>
            <p>
              {searchQuery
                ? 'Try adjusting your search query or filters.'
                : 'No applications match your current filters.'}
            </p>
          </div>
        ) : (
          <div className="apps-grid">
            {filteredApps.map((app) => {
              const shortKey =
                app.developer_pubkey && app.developer_pubkey.length > 12
                  ? `${app.developer_pubkey.slice(0, 6)}...${app.developer_pubkey.slice(-4)}`
                  : app.developer_pubkey;
              return (
                <div
                  key={`${app.registry}-${app.id}`}
                  className="app-card"
                  data-testid="app-card"
                  // The package id, which the card does not render: the
                  // registry publishes distinct packages that share a display
                  // name ("Mero Chat" is both com.calimero.chat and
                  // com.calimero.curb), so a test picking a card by its title
                  // picks non-deterministically between them.
                  data-package={app.id}
                  onClick={() => setSelectedApp(app)}
                >
                  <div className="app-card-header">
                    <div className="app-icon-wrapper">
                      <Package className="app-icon" size={20} />
                    </div>
                    <div className="app-title-section">
                      <h3>{app.alias ?? app.name}</h3>
                      {app.latest_version && (
                        <span className="app-version-badge">
                          v{app.latest_version}
                        </span>
                      )}
                    </div>
                    {app.installed && (
                      <CheckCircle2 className="installed-icon" size={18} />
                    )}
                  </div>

                  <div className="app-card-description">
                    <p>{app.description ?? 'No description available.'}</p>
                  </div>

                  <div className="app-card-footer">
                    <div className="app-meta">
                      <div className="app-meta-row">
                        <span className="app-meta-label">Author:</span>
                        <span className="app-meta-value">
                          {app.author ??
                            (shortKey && shortKey !== 'unknown'
                              ? shortKey
                              : '—')}
                        </span>
                      </div>
                      <div className="app-meta-row">
                        <span className="app-meta-label">Downloads:</span>
                        <span className="app-meta-value">
                          {(app.downloads ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="app-card-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {app.installed ? (
                      <button className="button button-success" disabled>
                        <CheckCircle2 size={16} />
                        Installed
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedApp(app)}
                        className="button button-primary"
                        disabled={installingAppId === app.id}
                      >
                        <Download size={16} />
                        Install
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {selectedApp && (
        <div
          className="app-detail-overlay"
          onClick={() => setSelectedApp(null)}
        >
          <div
            className="app-detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={selectedApp.alias ?? selectedApp.name}
            data-testid="app-detail-modal"
          >
            <button
              className="modal-close"
              onClick={() => setSelectedApp(null)}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
            <div className="modal-header">
              <div className="app-icon-wrapper modal-icon">
                <Package size={28} className="app-icon" />
              </div>
              <div className="modal-title">
                <h2>{selectedApp.alias ?? selectedApp.name}</h2>
                {selectedApp.latest_version && (
                  <span className="app-version-badge">
                    v{selectedApp.latest_version}
                  </span>
                )}
              </div>
              {selectedApp.installed && (
                <CheckCircle2 className="installed-icon" size={22} />
              )}
            </div>
            <p className="modal-description">
              {selectedApp.description ?? 'No description available.'}
            </p>
            <div className="modal-meta">
              <div className="modal-meta-row">
                <span className="modal-meta-label">Package ID</span>
                <span className="modal-meta-value mono">{selectedApp.id}</span>
              </div>
              <div className="modal-meta-row">
                <span className="modal-meta-label">Author</span>
                <span className="modal-meta-value">
                  {selectedApp.author ?? selectedApp.developer_pubkey ?? '—'}
                </span>
              </div>
              <div className="modal-meta-row">
                <span className="modal-meta-label">Downloads</span>
                <span className="modal-meta-value">
                  {(selectedApp.downloads ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="modal-meta-row">
                <span className="modal-meta-label">Version</span>
                {versionsLoading ? (
                  <span className="modal-meta-value modal-versions-loading">
                    <RefreshCw size={12} className="spinning" /> Loading…
                  </span>
                ) : availableVersions.length > 1 ? (
                  <select
                    className="modal-version-select"
                    value={selectedVersion}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    disabled={
                      installingAppId === selectedApp.id ||
                      selectedApp.installed
                    }
                    data-testid="version-picker"
                  >
                    {availableVersions.map((v, i) => (
                      <option key={v.semver} value={v.semver}>
                        {i === 0 ? `${v.semver} (latest)` : v.semver}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="modal-meta-value">
                    {selectedVersion || selectedApp.latest_version}
                  </span>
                )}
              </div>
              <div className="modal-meta-row">
                <span className="modal-meta-label">Registry</span>
                <button
                  className="modal-meta-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    const base = (() => {
                      try {
                        return new URL(selectedApp.registry).origin;
                      } catch {
                        return selectedApp.registry.replace(/\/+$/, '');
                      }
                    })();
                    openExternal(
                      `${base}/apps/${encodeURIComponent(selectedApp.id)}`,
                    );
                  }}
                >
                  View on Registry
                </button>
              </div>
            </div>
            <div className="modal-actions">
              {selectedApp.installed ? (
                <button className="button button-success" disabled>
                  <CheckCircle2 size={16} />
                  Installed
                </button>
              ) : (
                <button
                  onClick={() =>
                    void handleInstall(
                      selectedApp,
                      selectedVersion || selectedApp.latest_version,
                    )
                  }
                  className="button button-primary"
                  disabled={
                    installingAppId === selectedApp.id || versionsLoading
                  }
                  data-testid="modal-install"
                >
                  {installingAppId === selectedApp.id ? (
                    <>
                      <RefreshCw size={16} className="spinning" /> Installing…
                    </>
                  ) : (
                    <>
                      <Download size={16} /> Install
                    </>
                  )}
                </button>
              )}
              <button
                className="button button-secondary"
                onClick={() => setSelectedApp(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
