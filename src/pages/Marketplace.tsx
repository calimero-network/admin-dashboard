import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Package, X, ExternalLink } from 'lucide-react';
import AppCard, { type AppCardApp } from '../components/AppCard';
import AppIcon from '../components/AppIcon';
import Skeleton from '../components/Skeleton';
import { getSettings } from '../utils/settings';
import { fetchAppsFromAllRegistries, type AppSummary } from '../utils/registry';
import {
  getMarketplaceCache,
  setMarketplaceCache,
  touchMarketplaceCache,
  invalidateMarketplaceCache,
} from '../utils/marketplaceCache';
import {
  fetchInstalledApplications,
  installedKeySet,
} from '../utils/installedApps';
import { parseApiError } from '../utils/appUtils';
import { openExternal } from '../utils/openApp';
import './Marketplace.css';

interface MarketplaceApp extends AppCardApp {
  registry: string;
}

type InstalledFilter = 'all' | 'installed' | 'not-installed';

export default function Marketplace() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [filterInstalled, setFilterInstalled] =
    useState<InstalledFilter>('all');
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

  const loadInstalled = useCallback(async (): Promise<Set<string>> => {
    try {
      const names = installedKeySet(await fetchInstalledApplications());
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
          ...(app.tags ?? []),
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
            {Array.from({ length: 8 }).map((_, i) => (
              <MarketplaceCardSkeleton key={i} />
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
            {filteredApps.map((app) => (
              <AppCard
                key={`${app.registry}-${app.id}`}
                app={app}
                onOpen={(a) =>
                  navigate(`/marketplace/${encodeURIComponent(a.id)}`)
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * The loading card mirrors the real one's boxes, not a generic block: a
 * skeleton with a different shape from what replaces it makes the grid jump
 * once the data lands, which is the thing a skeleton exists to avoid.
 */
function MarketplaceCardSkeleton() {
  return (
    <div className="app-card app-card-skeleton" aria-hidden="true">
      <div className="app-card-top">
        <AppIcon seed="skeleton" name="" size={48} className="app-icon-muted" />
        <div className="app-card-headings">
          <Skeleton variant="text" width="65%" height="14px" />
          <Skeleton variant="text" width="85%" height="11px" />
        </div>
      </div>
      <Skeleton variant="text" width="100%" height="12px" />
      <Skeleton variant="text" width="72%" height="12px" />
      <div className="app-card-footer">
        <Skeleton
          variant="rectangular"
          width="70px"
          height="18px"
          borderRadius="6px"
        />
        <Skeleton variant="text" width="44px" height="11px" />
      </div>
    </div>
  );
}
