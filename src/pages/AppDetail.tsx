import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  Code2,
  ImageOff,
  Monitor,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import AppIcon from '../components/AppIcon';
import { VerifiedMark } from '../components/AppCard';
import Skeleton from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import {
  fetchAppsFromAllRegistries,
  fetchAppVersions,
  fetchPackageAssets,
  type AppSummary,
  type PackageAsset,
  type VersionInfo,
} from '../utils/registry';
import { getMarketplaceCache } from '../utils/marketplaceCache';
import {
  fetchInstalledApplications,
  installedKeySet,
} from '../utils/installedApps';
import { installApplication, registryAppUrl } from '../utils/installApp';
import {
  formatBytes,
  formatCategory,
  formatRelativeDate,
  shortenKey,
} from '../utils/appCards';
import { parseApiError } from '../utils/appUtils';
import { openExternal } from '../utils/openApp';
import './AppDetail.css';

interface DetailApp extends AppSummary {
  registry: string;
}

/**
 * One application, on its own route.
 *
 * This used to be a modal over the Marketplace grid. A route instead, because
 * the modal could not be linked to, could not be reloaded, and swallowed the
 * browser Back button — and because the version picker and the Install button
 * are the point of the screen rather than a detail of the listing.
 *
 * ⚠️ THE PAGE MUST STAND ON ITS OWN. Reaching it by a pasted URL or a refresh
 * means there is no in-memory listing to read from, so it serves the cached
 * bundle list when one is warm and otherwise refetches. Rendering "not found"
 * because a sibling page had not been visited is the bug this note exists to
 * prevent.
 */
export default function AppDetail() {
  const { packageId = '' } = useParams<{ packageId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [app, setApp] = useState<DetailApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshInstalled = useCallback(async (pkg: string, name?: string) => {
    try {
      const keys = installedKeySet(await fetchInstalledApplications());
      if (!mounted.current) return;
      setInstalled(keys.has(pkg) || (!!name && keys.has(name)));
    } catch {
      // A node that will not answer is not a reason to hide the page; the
      // Install button simply stays enabled and fails loudly if pressed.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);

      const registries = getSettings().registries;
      if (registries.length === 0) {
        setError('No registries configured. Add one in Settings → Registries.');
        setLoading(false);
        return;
      }

      const find = (
        results: { registry: string; apps: AppSummary[] }[],
      ): DetailApp | null => {
        for (const { registry, apps } of results) {
          const hit = apps.find((a) => a.id === packageId);
          if (hit) return { ...hit, registry };
        }
        return null;
      };

      const cached = getMarketplaceCache(registries);
      let found = cached ? find(cached.results) : null;

      if (!found) {
        try {
          found = find(await fetchAppsFromAllRegistries(registries));
        } catch (e) {
          if (cancelled || !mounted.current) return;
          setError(parseApiError(e));
          setLoading(false);
          return;
        }
      }

      if (cancelled || !mounted.current) return;
      if (!found) {
        setError(
          `No package named "${packageId}" in the configured registries.`,
        );
        setLoading(false);
        return;
      }
      setApp(found);
      setLoading(false);
      void refreshInstalled(found.id, found.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [packageId, refreshInstalled]);

  // Published versions, newest first. Defaults to the newest non-yanked build
  // rather than `latest_version`, which can itself have been yanked.
  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    setVersionsLoading(true);
    setSelectedVersion(app.latest_version);
    fetchAppVersions(app.registry, app.id)
      .then((list) => {
        if (cancelled || !mounted.current) return;
        setVersions(list);
        setSelectedVersion(list[0]?.semver ?? app.latest_version);
        setVersionsLoading(false);
      })
      .catch(() => {
        if (cancelled || !mounted.current) return;
        setVersions([]);
        setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app]);

  // Preview images. ⚠️ Every published package returns an empty list today —
  // the asset bucket is still open infrastructure — so this renders a stated
  // empty case rather than an empty region.
  const [assets, setAssets] = useState<PackageAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    setAssetsLoading(true);
    void fetchPackageAssets(app.registry, app.id).then((list) => {
      if (cancelled || !mounted.current) return;
      setAssets(list);
      setAssetsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [app]);

  const handleInstall = async () => {
    if (!app) return;
    setInstalling(true);
    try {
      await installApplication(app, selectedVersion || app.latest_version);
      toast.success(`${app.alias ?? app.name} installed`);
      setInstalled(true);
    } catch (e) {
      const msg = parseApiError(e);
      toast.error(
        `Failed to install: ${msg.length > 120 ? `${msg.slice(0, 120)}…` : msg}`,
      );
    } finally {
      if (mounted.current) setInstalling(false);
    }
  };

  const meta = useMemo(() => {
    if (!app) return [];
    // ⚠️ NO "Package ID" ROW. The header renders it directly under the title,
    // and repeating it here put the same string on the page twice.
    const rows: { label: string; value: React.ReactNode }[] = [];
    const author = app.author ?? shortenKey(app.developer_pubkey);
    if (author) {
      rows.push({
        label: 'Author',
        value: (
          <span className="app-detail-author">
            {author}
            {app.publisherVerified && <VerifiedMark label="Verified author" />}
          </span>
        ),
      });
    }
    const category = formatCategory(app.category);
    if (category) rows.push({ label: 'Category', value: category });
    rows.push({
      label: 'Downloads',
      value: (app.downloads ?? 0).toLocaleString(),
    });
    // ⚠️ `installSize ?? wasm.size`. `installSize` is null on all 21 published
    // bundles; `wasm.size` is populated on every one, so reading only the first
    // meant this row never rendered.
    const bytes = formatBytes(app.installSize ?? app.wasm?.size);
    if (bytes) rows.push({ label: 'Size', value: bytes });
    if (app.minRuntimeVersion) {
      rows.push({
        label: 'Requires node',
        value: <span className="app-detail-mono">{app.minRuntimeVersion}</span>,
      });
    }
    const when = formatRelativeDate(app.publishedAt);
    if (when) rows.push({ label: 'Published', value: when });
    if (app.signerId) {
      rows.push({
        label: 'Signed by',
        value: (
          <span className="app-detail-signer">
            <ShieldCheck size={13} aria-hidden="true" />
            <span className="app-detail-mono">{app.signerId}</span>
          </span>
        ),
      });
    }
    return rows;
  }, [app]);

  if (loading) return <DetailSkeleton />;

  if (error || !app) {
    return (
      <div className="app-detail-page">
        <BackLink />
        <div className="app-detail-error" data-testid="app-detail-error">
          <h2>Application unavailable</h2>
          <p>{error ?? 'Unknown error.'}</p>
          <button
            className="button button-secondary"
            onClick={() => navigate('/marketplace')}
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  const title = app.alias ?? app.name;
  const tags = (app.tags ?? []).filter((t) => t && t !== app.category);

  return (
    <div className="app-detail-page" data-testid="app-detail-page">
      <BackLink />

      <header className="app-detail-header">
        <AppIcon icon={app.icon} name={title} seed={app.id} size={72} />
        <div className="app-detail-identity">
          <h1 className="app-detail-title">{title}</h1>
          <p className="app-detail-package">
            <span className="app-detail-mono">{app.id}</span>
            {app.verified && <VerifiedMark label="Verified package" />}
          </p>
          {app.description && (
            <p className="app-detail-description">{app.description}</p>
          )}
        </div>
        {installed && (
          <span className="app-detail-installed-flag">
            <CheckCircle2 size={16} aria-hidden="true" /> Installed
          </span>
        )}
      </header>

      <section className="app-detail-install" aria-label="Install">
        <div className="app-detail-version">
          <label htmlFor="app-version">Version</label>
          {versionsLoading ? (
            <span className="app-detail-versions-loading">
              <RefreshCw size={12} className="spinning" /> Loading…
            </span>
          ) : versions.length > 0 ? (
            <select
              id="app-version"
              className="app-detail-version-select"
              data-testid="version-picker"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              disabled={installing}
            >
              {versions.map((v, i) => (
                <option key={v.semver} value={v.semver}>
                  {i === 0 ? `${v.semver} (latest)` : v.semver}
                </option>
              ))}
            </select>
          ) : (
            <span className="app-detail-version-static">
              {selectedVersion || app.latest_version}
            </span>
          )}
        </div>

        <button
          className="button button-primary"
          data-testid="detail-install"
          onClick={() => void handleInstall()}
          disabled={installing || versionsLoading}
        >
          {installing ? (
            <>
              <RefreshCw size={16} className="spinning" /> Installing…
            </>
          ) : installed ? (
            <>
              <Download size={16} /> Install again
            </>
          ) : (
            <>
              <Download size={16} /> Install
            </>
          )}
        </button>

        <button
          className="button button-secondary"
          onClick={() => openExternal(registryAppUrl(app.registry, app.id))}
        >
          <ExternalLink size={14} /> View on Registry
        </button>
      </section>

      {/* ⚠️ A STATED EMPTY CASE, NOT A HIDDEN SECTION. Every published package
          returns `assets: []` right now (the bucket is still open infra), so a
          section that simply vanished would make every app page look unfinished
          and give nobody a reason to upload one. */}
      <section className="app-detail-section" aria-label="Preview">
        <p className="app-detail-section-heading">Preview</p>
        {assetsLoading ? (
          <div className="app-detail-preview-empty">
            <RefreshCw size={16} className="spinning" /> Loading preview…
          </div>
        ) : assets.length > 0 ? (
          <div className="app-detail-preview-strip">
            {assets.map((a, i) => (
              <a
                key={a.id ?? a.url ?? i}
                className="app-detail-shot"
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <img
                  src={a.thumbnailUrl ?? a.url}
                  alt={a.alt ?? `${title} screenshot ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            ))}
          </div>
        ) : (
          <div className="app-detail-preview-empty">
            <ImageOff size={18} aria-hidden="true" />
            <span>
              No preview images published for this app yet. Publishers add them
              on the registry.
            </span>
          </div>
        )}
      </section>

      {(app.links?.github || app.links?.docs || app.links?.frontend) && (
        <section className="app-detail-section" aria-label="Links">
          <p className="app-detail-section-heading">Links</p>
          <div className="app-detail-links">
            {app.links?.frontend && (
              <LinkCard
                icon={Monitor}
                label="Try it out on web"
                href={app.links.frontend}
              />
            )}
            {app.links?.github && (
              <LinkCard
                icon={Code2}
                label="Source code"
                href={app.links.github}
              />
            )}
            {app.links?.docs && (
              <LinkCard
                icon={BookOpen}
                label="Documentation"
                href={app.links.docs}
              />
            )}
          </div>
        </section>
      )}

      <section className="app-detail-meta" aria-label="Details">
        {meta.map((row) => (
          <div className="app-detail-meta-row" key={row.label}>
            <span className="app-detail-meta-label">{row.label}</span>
            <span className="app-detail-meta-value">{row.value}</span>
          </div>
        ))}
      </section>

      {tags.length > 0 && (
        <section className="app-detail-tags" aria-label="Tags">
          {tags.map((t) => (
            <span className="app-detail-tag" key={t}>
              {t}
            </span>
          ))}
        </section>
      )}
    </div>
  );
}

/** One outbound link, opened in the user's browser rather than in-app. */
function LinkCard({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof Monitor;
  label: string;
  href: string;
}) {
  return (
    <button
      type="button"
      className="app-detail-link-card"
      onClick={() => openExternal(href)}
      title={href}
    >
      <Icon size={15} aria-hidden="true" />
      <span className="app-detail-link-label">{label}</span>
      <ExternalLink size={12} aria-hidden="true" />
    </button>
  );
}

function BackLink() {
  return (
    <Link to="/marketplace" className="app-detail-back">
      <ArrowLeft size={15} /> Marketplace
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="app-detail-page">
      <BackLink />
      <header className="app-detail-header">
        <Skeleton
          variant="rectangular"
          width="72px"
          height="72px"
          borderRadius="16px"
        />
        <div className="app-detail-identity">
          <Skeleton variant="text" width="220px" height="24px" />
          <Skeleton variant="text" width="180px" height="13px" />
          <Skeleton variant="text" width="100%" height="13px" />
        </div>
      </header>
      <section className="app-detail-install">
        <Skeleton
          variant="rectangular"
          width="180px"
          height="38px"
          borderRadius="10px"
        />
        <Skeleton
          variant="rectangular"
          width="130px"
          height="38px"
          borderRadius="10px"
        />
      </section>
    </div>
  );
}
