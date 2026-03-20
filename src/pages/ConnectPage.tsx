import React, { useState } from 'react';
import './ConnectPage.css';

interface ConnectPageProps {
  onConnect: (url: string) => void;
}

export default function ConnectPage({ onConnect }: ConnectPageProps) {
  const [url, setUrl] = useState('http://localhost:2528');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!url.trim()) return;
    try {
      new URL(url.trim());
    } catch {
      setError('Invalid URL format');
      return;
    }
    const normalized = url.trim().replace(/\/+$/, '');
    setLoading(true);
    try {
      const res = await fetch(`${normalized}/admin-api/health`);
      if (!res.ok) {
        setError(
          `Node returned ${res.status}. Check the URL and make sure the node is running.`,
        );
        return;
      }
      onConnect(normalized);
    } catch {
      setError(
        'Could not reach node. Make sure it is running and the URL is correct.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-page">
      <div className="connect-card">
        <div className="connect-logo">
          <span className="connect-logo-dot" />
          <span className="connect-logo-name">Calimero</span>
          <span className="connect-logo-badge">Admin</span>
        </div>

        <div className="connect-body">
          <h1 className="connect-title">Connect to Node</h1>
          <p className="connect-subtitle">
            Enter your Calimero node URL to access the admin dashboard
          </p>

          <form onSubmit={handleSubmit} className="connect-form">
            <div className="connect-field">
              <label className="connect-label">Node URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                }}
                placeholder="http://localhost:2428"
                className={`connect-input${error ? ' connect-input-error' : ''}`}
                autoFocus
                spellCheck={false}
              />
              {error && <span className="connect-error-text">{error}</span>}
            </div>

            <button
              type="submit"
              className="connect-btn"
              disabled={!url.trim() || loading}
            >
              {loading ? (
                <>
                  <span className="connect-spinner" /> Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </form>

          <p className="connect-hint">
            Default local node: <code>http://localhost:2528</code>
          </p>
        </div>
      </div>
    </div>
  );
}
