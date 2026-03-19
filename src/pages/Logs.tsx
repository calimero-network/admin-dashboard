import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { getAuthEndpointURL } from '@calimero-network/calimero-client';
import { ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import './Logs.css';

interface LogEntry {
  raw: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | '';
}

function parseLine(line: string): LogEntry {
  const upper = line.toUpperCase();
  let level: LogEntry['level'] = '';
  if (upper.includes('[ERROR]') || upper.includes(' ERROR ')) level = 'ERROR';
  else if (upper.includes('[WARN]') || upper.includes(' WARN ')) level = 'WARN';
  else if (upper.includes('[INFO]') || upper.includes(' INFO ')) level = 'INFO';
  else if (upper.includes('[DEBUG]') || upper.includes(' DEBUG ')) level = 'DEBUG';
  else if (upper.includes('[TRACE]') || upper.includes(' TRACE ')) level = 'TRACE';
  return { raw: line, level };
}

const LEVEL_COLORS: Record<string, string> = {
  ERROR: '#ef4444',
  WARN: '#f59e0b',
  INFO: '#a5ff11',
  DEBUG: '#3b82f6',
  TRACE: '#71717a',
};

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = getAuthEndpointURL();
      if (!baseUrl) throw new Error('Node URL not configured');

      // Try multiple possible log endpoints
      const endpoints = ['/admin/logs', '/logs', '/admin/status'];
      let found = false;

      for (const ep of endpoints) {
        try {
          const res = await fetch(`${baseUrl}${ep}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (res.ok) {
            const text = await res.text();
            const lines = text.split('\n').filter(Boolean).map(parseLine);
            setLogs(lines);
            found = true;
            break;
          }
        } catch {}
      }

      if (!found) {
        setError('No logs endpoint available on this node. Logs are typically only accessible through the Calimero Desktop application.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filtered = logs.filter(entry => {
    const matchSearch = !search || entry.raw.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !levelFilter || entry.level === levelFilter;
    return matchSearch && matchLevel;
  });

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content logs-page">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Node Logs</h1>
            <p>Diagnostic output from the connected node</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="logs-autoscroll">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
            <button className="btn" onClick={fetchLogs} disabled={loading}>
              <ArrowPathIcon style={{ width: 16, height: 16 }} className={loading ? 'spin' : ''} />
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="logs-toolbar">
          <div className="logs-search">
            <MagnifyingGlassIcon className="logs-search-icon" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="logs-search-input"
            />
          </div>
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="logs-level-select"
          >
            <option value="">All levels</option>
            <option value="ERROR">Error</option>
            <option value="WARN">Warn</option>
            <option value="INFO">Info</option>
            <option value="DEBUG">Debug</option>
            <option value="TRACE">Trace</option>
          </select>
          {(search || levelFilter) && (
            <span className="logs-count">{filtered.length} / {logs.length} lines</span>
          )}
        </div>

        {error ? (
          <div className="logs-unavailable">
            <div className="logs-unavail-icon">📋</div>
            <h3>Logs Unavailable via HTTP</h3>
            <p>{error}</p>
            <p style={{ marginTop: 8 }}>Use the <strong>Calimero Desktop</strong> app to view real-time node logs.</p>
            <button className="btn" style={{ marginTop: 16 }} onClick={fetchLogs}>Try Again</button>
          </div>
        ) : (
          <div ref={scrollRef} className="logs-terminal">
            {loading && logs.length === 0 ? (
              <span className="logs-placeholder">Loading logs...</span>
            ) : filtered.length === 0 ? (
              <span className="logs-placeholder">No log entries{search || levelFilter ? ' matching filter' : ''}.</span>
            ) : (
              filtered.map((entry, i) => (
                <div key={i} className="log-line">
                  {entry.level && (
                    <span className="log-level" style={{ color: LEVEL_COLORS[entry.level] }}>
                      [{entry.level}]
                    </span>
                  )}
                  <span className="log-text">{entry.raw}</span>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
