import React, {
  useEffect,
  useState,
  useCallback,
  useContext,
  createContext,
  ReactNode,
} from 'react';
import Sidebar from './Sidebar';
import ToastContainer from './ToastContainer';
import ErrorBoundary from './ErrorBoundary';
import {
  NodeStatusIndicator,
  type NodeConnectionState,
} from './NodeStatusIndicator';
import { getNodeUrl } from '../utils/nodeUrl';
import { DASHBOARD_VERSION } from '../utils/version';
import '../styles/shell.css';

/** Matches the desktop's 10s health-check interval. */
const HEALTH_POLL_MS = 10_000;
const HEALTH_TIMEOUT_MS = 3_000;

interface NodeStatus {
  state: NodeConnectionState;
  error: string | null;
}

/**
 * The shell already polls health for the header pill; pages that also want to
 * show connection state read it from here rather than starting a second poll.
 */
const NodeStatusContext = createContext<NodeStatus>({
  state: 'checking',
  error: null,
});

export function useNodeStatus(): NodeStatus {
  return useContext(NodeStatusContext);
}

interface AppShellProps {
  /** Rendered in the header. */
  title: string;
  children: ReactNode;
}

async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${getNodeUrl()}/admin-api/health`, {
      signal: controller.signal,
    });
    return res.ok
      ? { ok: true }
      : { ok: false, error: `Node returned ${res.status}` };
  } catch {
    return { ok: false, error: 'Node not responding' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The application chrome every page renders inside: sidebar, fixed header with
 * the page title + version badge + node status pill, and the scrolling main
 * region. Mirrors the desktop's `.app > .app-layout > .app-content` structure so
 * the ported CSS applies unchanged.
 */
export default function AppShell({ title, children }: AppShellProps) {
  const [state, setState] = useState<NodeConnectionState>('checking');
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const { ok, error: err } = await checkHealth();
    setState(ok ? 'online' : 'offline');
    setError(ok ? null : err ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void poll();
    };
    run();
    const interval = setInterval(run, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll]);

  return (
    <div className="app">
      <ToastContainer />
      <div className="app-layout">
        <Sidebar />
        <div className="app-content">
          <header className="header">
            <div className="header-title">
              <h1 data-testid="shell-page-title">{title}</h1>
              {/* `git describe` already yields a leading "v" for tagged builds;
                  don't add another. */}
              <span className="version-badge">{DASHBOARD_VERSION}</span>
            </div>
            <NodeStatusIndicator
              state={state}
              error={error}
              nodeUrl={getNodeUrl()}
            />
          </header>
          <main className="main">
            <ErrorBoundary componentName={title}>
              <NodeStatusContext.Provider value={{ state, error }}>
                {children}
              </NodeStatusContext.Provider>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
