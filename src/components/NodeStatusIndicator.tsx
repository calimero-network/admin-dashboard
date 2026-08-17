import React from 'react';
import { Server } from 'lucide-react';
import './NodeStatusIndicator.css';

export type NodeConnectionState = 'checking' | 'online' | 'offline';

interface NodeStatusIndicatorProps {
  state: NodeConnectionState;
  /** Error detail shown in the tooltip when offline. */
  error?: string | null;
  /** The node this dashboard administers, shown in the tooltip. */
  nodeUrl?: string;
}

/**
 * Header connection pill.
 *
 * Ported from the desktop's NodeStatusIndicator with the multi-node dropdown
 * removed: the desktop can have several local merod processes and lets you
 * switch between them, but this dashboard is served by the one node it
 * administers (see utils/nodeUrl.ts), so there is nothing to pick between and
 * no "Restart Node" action — we cannot control a process from a browser tab.
 */
export function NodeStatusIndicator({
  state,
  error,
  nodeUrl,
}: NodeStatusIndicatorProps) {
  const label =
    state === 'checking'
      ? 'Connecting…'
      : state === 'online'
        ? 'Connected'
        : 'Disconnected';

  const title =
    state === 'offline'
      ? `${error ?? 'Node unreachable'}${nodeUrl ? ` (${nodeUrl})` : ''}`
      : state === 'online'
        ? `Node connected${nodeUrl ? ` — ${nodeUrl}` : ''}`
        : 'Checking node connection';

  return (
    <div
      className={`node-status-indicator ${state === 'online' ? 'connected' : 'disconnected'}`}
      title={title}
      data-testid="node-status-indicator"
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <span className="node-status-dot" />
      <Server size={14} className="node-status-icon" />
      <span className="node-status-label">{label}</span>
    </div>
  );
}

export default NodeStatusIndicator;
