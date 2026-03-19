import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { apiClient } from '@calimero-network/calimero-client';
import { MagnifyingGlassIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import bs58 from 'bs58';
import './NewMarketplace.css';

const REGISTRY_URL = import.meta.env['VITE_SERVER_URL'] || 'https://apps.calimero.network';

/**
 * Record a download with the app registry (fire-and-forget).
 * Call after a successful install so download counts stay accurate.
 */
function recordDownload(registryBaseUrl: string, packageName: string, version?: string): void {
  try {
    const recordUrl = new URL('/api/v2/downloads/record', registryBaseUrl).toString();
    fetch(recordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName, ...(version && { version }) }),
      mode: 'cors',
    }).catch(() => {});
  } catch {
    // ignore invalid URL or serialization
  }
}

interface RegistryBundle {
  package: string;
  appVersion: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    links?: { frontend?: string };
  };
  artifacts?: Array<{
    type: string;
    mirrors?: string[];
    cid?: string;
    sha256?: string;
  }>;
  downloads?: number;
  minRuntimeVersion?: string;
}

interface InstalledApp {
  id: string;
  source: string;
}


export default function NewMarketplace() {
  const [bundles, setBundles] = useState<RegistryBundle[]>([]);
  const [installedSources, setInstalledSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadInstalled = useCallback(async () => {
    try {
      const res = await apiClient.node().getInstalledApplications();
      const apps: any[] = (res.data as any)?.data?.apps ?? (res.data as any)?.apps ?? [];
      // Track by package name extracted from metadata or source URL
      const names = new Set<string>();
      apps.forEach(a => {
        if (a.source) names.add(a.source);
        try {
          const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(a.metadata || [])));
          if (meta.package) names.add(meta.package);
          if (meta.name) names.add(meta.name);
        } catch {}
      });
      setInstalledSources(names);
    } catch {}
  }, []);

  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${REGISTRY_URL}/api/v2/bundles`);
      if (!res.ok) throw new Error(`Registry returned ${res.status}`);
      const data = await res.json();
      const list: RegistryBundle[] = Array.isArray(data) ? data : data.bundles || [];
      setBundles(list);
    } catch (e: any) {
      setError(e.message || 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarketplace();
    loadInstalled();
  }, [loadMarketplace, loadInstalled]);

  const handleInstall = async (bundle: RegistryBundle) => {
    const key = bundle.package + '@' + bundle.appVersion;
    setInstalling(key);
    try {
      // Always fetch individual manifest to get artifact URL
      const manifestRes = await fetch(`${REGISTRY_URL}/api/v2/bundles/${encodeURIComponent(bundle.package)}/${encodeURIComponent(bundle.appVersion)}`);
      if (!manifestRes.ok) throw new Error(`Failed to fetch manifest: ${manifestRes.status}`);
      const manifest = await manifestRes.json();

      let wasmUrl: string;
      let wasmHashHex: string | null = null;

      if (manifest.artifact) {
        // V1 format
        if (!manifest.artifact.uri) throw new Error('Invalid manifest: artifact URI is missing');
        wasmUrl = manifest.artifact.uri;
        wasmHashHex = manifest.artifact.digest?.replace('sha256:', '') || null;
      } else if (manifest.artifacts && manifest.artifacts.length > 0) {
        // V2 format
        const mpkArtifact = manifest.artifacts.find((a: any) => a.type === 'mpk');
        const wasmArtifact = manifest.artifacts.find((a: any) => a.type === 'wasm');
        if (mpkArtifact) {
          wasmUrl = mpkArtifact.mirrors?.[0] || `https://ipfs.io/ipfs/${mpkArtifact.cid}`;
          wasmHashHex = mpkArtifact.sha256?.replace('sha256:', '') || null;
          if (!wasmHashHex && mpkArtifact.cid && /^[0-9a-f]{64}$/i.test(mpkArtifact.cid)) {
            wasmHashHex = mpkArtifact.cid;
          }
        } else if (wasmArtifact) {
          wasmUrl = wasmArtifact.mirrors?.[0] || `https://ipfs.io/ipfs/${wasmArtifact.cid}`;
          wasmHashHex = wasmArtifact.sha256?.replace('sha256:', '') || null;
          if (!wasmHashHex && wasmArtifact.cid && /^[0-9a-f]{64}$/i.test(wasmArtifact.cid)) {
            wasmHashHex = wasmArtifact.cid;
          }
        } else {
          throw new Error('No MPK or WASM artifact found in manifest');
        }
      } else {
        // Registry v2 bundles: no artifacts field — construct MPK URL by convention
        // Convention: /artifacts/{package}/{version}/{package}-{version}.mpk
        wasmUrl = `${REGISTRY_URL}/artifacts/${encodeURIComponent(bundle.package)}/${encodeURIComponent(bundle.appVersion)}/${encodeURIComponent(bundle.package)}-${encodeURIComponent(bundle.appVersion)}.mpk`;
        wasmHashHex = manifest.wasm?.hash?.replace('sha256:', '') || null;
      }

      // Convert hex hash to base58
      let wasmHashBase58: string | undefined;
      if (wasmHashHex && wasmHashHex.length === 64) {
        try {
          const hashBytes = Uint8Array.from(
            wasmHashHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
          );
          wasmHashBase58 = bs58.encode(hashBytes);
        } catch {}
      }

      const name = bundle.metadata?.name || bundle.package;
      const metadataJson = JSON.stringify({
        name,
        description: manifest.metadata?.description || bundle.metadata?.description || '',
        version: bundle.appVersion,
        developer: manifest.metadata?.author || '',
        minRuntimeVersion: manifest.minRuntimeVersion,
      });
      // MPK files: empty metadata bytes; WASM: include encoded metadata
      const metadataBytes = wasmUrl.endsWith('.mpk') ? new Uint8Array(0) : new TextEncoder().encode(metadataJson);

      const res = await apiClient.node().installApplication(wasmUrl, metadataBytes, wasmHashBase58);
      if (res.error) throw new Error(res.error.message?.slice(0, 120) || 'Install failed');

      recordDownload(REGISTRY_URL, bundle.package, bundle.appVersion);
      showToast(`${name} installed!`, 'success');
      await loadInstalled();
    } catch (e: any) {
      showToast(e.message?.slice(0, 120) || 'Install failed', 'error');
    } finally {
      setInstalling(null);
    }
  };

  const filtered = bundles.filter(b => {
    const q = search.toLowerCase();
    const name = (b.metadata?.name || b.package).toLowerCase();
    const desc = (b.metadata?.description || '').toLowerCase();
    return name.includes(q) || desc.includes(q) || b.package.toLowerCase().includes(q);
  });

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Marketplace</h1>
            <p>Browse and install applications from the registry</p>
          </div>
          <button className="btn" onClick={() => { loadMarketplace(); loadInstalled(); }} disabled={loading}>
            <ArrowPathIcon style={{ width: 16, height: 16 }} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {toast && (
          <div className={`alert alert-${toast.type}`}>{toast.msg}</div>
        )}

        <div className="mkt-search-bar">
          <MagnifyingGlassIcon className="mkt-search-icon" />
          <input
            type="text"
            placeholder="Search applications..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mkt-search-input"
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div className="mkt-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mkt-card mkt-card-skeleton">
                <div className="skel-line skel-title" />
                <div className="skel-line skel-short" />
                <div className="skel-line" />
                <div className="skel-line skel-short" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <h3>{search ? 'No apps match your search' : 'No applications found'}</h3>
            <p>{search ? 'Try a different search term.' : 'The registry appears to be empty.'}</p>
          </div>
        ) : (
          <div className="mkt-grid">
            {filtered.map(bundle => {
              const name = bundle.metadata?.name || bundle.package;
              const desc = bundle.metadata?.description;
              const author = bundle.metadata?.author;
              const key = bundle.package + '@' + bundle.appVersion;
              const isInstalling = installing === key;
              const isInstalled = installedSources.has(bundle.package);

              return (
                <div key={key} className="mkt-card">
                  <div className="mkt-card-header">
                    <div className="mkt-card-icon">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="mkt-card-title-section">
                      <h3 className="mkt-card-title">{name}</h3>
                      <span className="mkt-card-version">v{bundle.appVersion}</span>
                    </div>
                    {isInstalled && <CheckCircleIcon className="mkt-installed-icon" />}
                  </div>

                  {desc && <p className="mkt-card-desc">{desc}</p>}

                  <div className="mkt-card-meta">
                    <span className="mkt-meta-item" title={bundle.package}>{bundle.package}</span>
                    {author && <span className="mkt-meta-item">by {author}</span>}
                    {bundle.downloads != null && bundle.downloads > 0 && (
                      <span className="mkt-meta-item mkt-downloads">↓ {bundle.downloads.toLocaleString()}</span>
                    )}
                  </div>

                  <div className="mkt-card-actions">
                    {isInstalled ? (
                      <button className="btn btn-sm" disabled>Installed</button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleInstall(bundle)}
                        disabled={isInstalling}
                      >
                        {isInstalling ? (
                          <><ArrowPathIcon style={{ width: 13, height: 13 }} className="spin" /> Installing...</>
                        ) : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
