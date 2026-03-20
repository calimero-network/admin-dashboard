import React from 'react';
import './ConnectPage.css';

interface LoginPageProps {
  onLogin: () => void;
  onReset: () => void;
}

export default function LoginPage({ onLogin, onReset }: LoginPageProps) {
  return (
    <div className="connect-page">
      <div className="connect-card">
        <div className="connect-logo">
          <span className="connect-logo-dot" />
          <span className="connect-logo-name">Calimero</span>
          <span className="connect-logo-badge">Admin</span>
        </div>

        <div className="connect-body">
          <h1 className="connect-title">Admin Login</h1>
          <p className="connect-subtitle">
            Authenticate with your Calimero node to access the admin dashboard.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <button className="connect-btn" onClick={onLogin}>
              Login with Node
            </button>
            <button
              onClick={onReset}
              style={{
                padding: '10px',
                fontSize: 14,
                fontWeight: 500,
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
              onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              Change Node URL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
