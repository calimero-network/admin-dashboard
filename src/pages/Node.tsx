import React, { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '@calimero-network/calimero-client';
import { RefreshCw, Copy } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import Skeleton from '../components/Skeleton';
import {
  getAdminApiUrl,
  getNodeUrl,
  isDevOverrideActive,
} from '../utils/nodeUrl';
import { parseApiError } from '../utils/appUtils';
import './Node.css';

/**
 * Read-only diagnostics for the single node this dashboard is served by.
 *
 * This replaces the desktop's "Nodes" tab. Everything that tab does beyond
 * *reporting* — create a node, pick a data directory, choose server/swarm ports,
 * start, stop, read the merod log file — is local process and filesystem
 * control, which a browser tab has no access to. What is left is genuinely
 * useful and entirely served by the node's own admin API.
 *
 * Note on logs: there is deliberately no logs panel. Core exposes no logs route
 * (the full admin router is in core/crates/server/src/admin/service.rs); the
 * desktop can show logs only because IT spawns merod and tees stdout into
 * <data_dir>/<node>/logs/merod.log and tails that file. Serving logs here needs
 * a `GET /admin-api/logs` in core first.
 */

interface NetworkStatus {
  localPeerId?: string;
  listenAddrs?: string[];
  externalAddrs?: string[];
  relays?: { peerId: string; reservationStatus: string }[];
  rendezvous?: { peerId: string; registrationStatus: string }[];
  autonat?: { kind: string; reachability: string }[];
}

interface NamespaceUsage {
  namespaceId?: string;
  alias?: string;
  contextCount?: number;
  memberCount?: number;
  subgroupCount?: number;
  bytes?: {
    state?: number;
    privateState?: number;
    delta?: number;
    governance?: number;
  };
}

/** Unwrap core's `ApiResponse { payload }` / `{ data }` envelopes. */
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T; payload?: T } | undefined;
  return (b?.data ?? b?.payload ?? body) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${getAdminApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return unwrap<T>(await res.json());
}

/**
 * `/ready` answers 503 while the node is Starting or ShuttingDown, and the
 * lifecycle label we want is in *that* body — so unlike every other panel a
 * non-OK response here is data, not an error.
 */
async function getReadiness(): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`${getAdminApiUrl()}/ready`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = unwrap<{ status?: string }>(await res.json().catch(() => ({})));
  return body?.status ?? (res.ok ? 'ready' : 'unknown');
}

function formatBytes(n: number | undefined): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function NodePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<string | null>(null);
  const [peers, setPeers] = useState<number | null>(null);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [usage, setUsage] = useState<NamespaceUsage[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const problems: string[] = [];

    // Each panel is fetched independently: `/usage` walking a large store or a
    // network actor being slow must not blank the whole page.
    const results = await Promise.allSettled([
      getJson<{ status?: string }>('/health'),
      getJson<{ count?: number }>('/peers'),
      getJson<NetworkStatus>('/network/status'),
      getJson<{ namespaces?: NamespaceUsage[] }>('/usage'),
      getReadiness(),
    ]);

    const [h, p, n, u, r] = results;
    if (h.status === 'fulfilled') setHealth(h.value.status ?? 'alive');
    else problems.push(`Health: ${parseApiError(h.reason)}`);

    if (r.status === 'fulfilled') setReadiness(r.value);
    else problems.push(`Readiness: ${parseApiError(r.reason)}`);

    if (p.status === 'fulfilled') setPeers(p.value.count ?? 0);
    else problems.push(`Peers: ${parseApiError(p.reason)}`);

    if (n.status === 'fulfilled') setNetwork(n.value);
    else problems.push(`Network status: ${parseApiError(n.reason)}`);

    if (u.status === 'fulfilled') setUsage(u.value.namespaces ?? []);
    else problems.push(`Usage: ${parseApiError(u.reason)}`);

    setErrors(problems);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = (value: string, what: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  };

  return (
    <div className="node-page">
      <header className="page-header">
        <div className="page-header-left">
          <h1>Node</h1>
          <p>
            Diagnostics for the node serving this dashboard. Read-only — node
            processes are managed on the host, or with Calimero Desktop.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </header>

      {errors.length > 0 && (
        <div className="error-message">
          <strong>Some panels could not be loaded:</strong>
          <ul className="node-error-list">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="node-section">
        <h2 className="node-section-title">Connection</h2>
        <div className="node-grid">
          <div className="node-stat">
            <span className="node-stat-label">Status</span>
            <span
              className={`node-stat-value ${health === 'alive' ? 'ok' : 'bad'}`}
              data-testid="node-health"
            >
              {loading ? (
                <Skeleton variant="text" width="60px" />
              ) : (
                health ?? 'unreachable'
              )}
            </span>
          </div>
          <div className="node-stat">
            <span className="node-stat-label">Lifecycle</span>
            <span
              className={`node-stat-value ${readiness === 'ready' ? 'ok' : 'warn'}`}
              data-testid="node-readiness"
            >
              {loading ? (
                <Skeleton variant="text" width="70px" />
              ) : (
                readiness ?? '—'
              )}
            </span>
          </div>
          <div className="node-stat">
            <span className="node-stat-label">Connected peers</span>
            <span className="node-stat-value" data-testid="node-peers">
              {loading ? (
                <Skeleton variant="text" width="40px" />
              ) : (
                peers ?? '—'
              )}
            </span>
          </div>
          <div className="node-stat node-stat-wide">
            <span className="node-stat-label">Node URL</span>
            <span className="node-stat-value mono">
              {getNodeUrl()}
              {isDevOverrideActive() && (
                <span className="node-badge">dev override</span>
              )}
            </span>
          </div>
          <div className="node-stat node-stat-wide">
            <span className="node-stat-label">Admin API</span>
            <span className="node-stat-value mono">{getAdminApiUrl()}</span>
          </div>
        </div>
      </section>

      <section className="node-section">
        <h2 className="node-section-title">Network</h2>
        {loading ? (
          <Skeleton variant="rectangular" height="120px" />
        ) : network ? (
          <div className="node-card">
            <div className="node-kv">
              <span className="node-kv-key">Peer ID</span>
              <span className="node-kv-value mono">
                {network.localPeerId ?? '—'}
                {network.localPeerId && (
                  <button
                    className="node-copy-btn"
                    title="Copy peer ID"
                    onClick={() =>
                      copy(network.localPeerId as string, 'Peer ID')
                    }
                  >
                    <Copy size={12} />
                  </button>
                )}
              </span>
            </div>
            <div className="node-kv">
              <span className="node-kv-key">Listen addresses</span>
              <span className="node-kv-value mono">
                {network.listenAddrs?.length
                  ? network.listenAddrs.map((a) => <div key={a}>{a}</div>)
                  : '—'}
              </span>
            </div>
            <div className="node-kv">
              <span className="node-kv-key">External addresses</span>
              <span className="node-kv-value mono">
                {network.externalAddrs?.length
                  ? network.externalAddrs.map((a) => <div key={a}>{a}</div>)
                  : '—'}
              </span>
            </div>
            <div className="node-kv">
              <span className="node-kv-key">Relays</span>
              <span className="node-kv-value mono">
                {network.relays?.length
                  ? network.relays.map((r) => (
                      <div key={r.peerId}>
                        {r.peerId} — {r.reservationStatus}
                      </div>
                    ))
                  : 'none'}
              </span>
            </div>
            <div className="node-kv">
              <span className="node-kv-key">Rendezvous</span>
              <span className="node-kv-value mono">
                {network.rendezvous?.length
                  ? network.rendezvous.map((r) => (
                      <div key={r.peerId}>
                        {r.peerId} — {r.registrationStatus}
                      </div>
                    ))
                  : 'none'}
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>Network status unavailable.</p>
          </div>
        )}
      </section>

      <section className="node-section">
        <h2 className="node-section-title">Managing this node</h2>
        <div className="node-card node-manage">
          <p className="node-manage-lede">
            Starting, stopping and restarting happen on the host, not from here.
            Two reasons, both hard:
          </p>
          <ol className="node-manage-list">
            <li>
              <b>The node exposes no lifecycle API.</b> Its whole admin surface
              is applications, contexts, namespaces, blobs, identity and these
              read-only diagnostics. <code>merod</code> stops on a{' '}
              <code>SIGTERM</code> — an OS signal a browser tab cannot send.
            </li>
            <li>
              <b>This page is served by the node it would stop.</b> Killing it
              kills the server delivering this UI, and nothing here could start
              it again — the process that would handle “start” is the one that
              just exited. Calimero Desktop can do it because it runs as a
              separate parent process that owns <code>merod</code> as a child.
            </li>
          </ol>
          <p className="node-manage-lede">
            On the host, with the node’s name and data directory:
          </p>
          <div className="node-cmds">
            {[
              ['Stop', 'pkill -TERM -f "merod.*--node-name <name>"'],
              ['Start', 'merod --node-name <name> --home <data-dir> run'],
              [
                'Restart',
                'pkill -TERM -f "merod.*--node-name <name>" && merod --node-name <name> --home <data-dir> run',
              ],
            ].map(([label, cmd]) => (
              <div className="node-cmd" key={label}>
                <span className="node-cmd-label">{label}</span>
                <code className="node-cmd-text">{cmd}</code>
                <button
                  type="button"
                  className="node-copy-btn"
                  title={`Copy ${label} command`}
                  aria-label={`Copy ${label} command`}
                  onClick={() => copy(cmd as string, `${label} command`)}
                >
                  <Copy size={12} />
                </button>
              </div>
            ))}
          </div>
          <p className="node-hint" style={{ padding: '4px 0 0' }}>
            For multiple nodes on one machine, or live node logs, use Calimero
            Desktop — it owns the processes and can read the log files it
            writes.
          </p>
        </div>
      </section>

      <section className="node-section">
        <h2 className="node-section-title">Storage by namespace</h2>
        {loading ? (
          <Skeleton variant="rectangular" height="100px" />
        ) : usage && usage.length > 0 ? (
          <div className="data-table-container data-table-compact">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Namespace</th>
                  <th>Contexts</th>
                  <th>Members</th>
                  <th>Subgroups</th>
                  <th>State</th>
                  <th>Delta</th>
                  <th>Governance</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((ns, i) => (
                  <tr key={ns.namespaceId ?? `ns-${i}`}>
                    <td className="mono">
                      {ns.alias ?? ns.namespaceId ?? '—'}
                    </td>
                    <td>{ns.contextCount ?? 0}</td>
                    <td>{ns.memberCount ?? 0}</td>
                    <td>{ns.subgroupCount ?? 0}</td>
                    <td>{formatBytes(ns.bytes?.state)}</td>
                    <td>{formatBytes(ns.bytes?.delta)}</td>
                    <td>{formatBytes(ns.bytes?.governance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="node-hint">
              Byte counts are sampled from RocksDB SST metadata — approximate,
              not exact.
            </p>
          </div>
        ) : (
          <div className="empty-state">
            <p>This node is not a member of any namespace yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
