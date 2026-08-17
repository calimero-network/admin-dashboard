import React from 'react';
import { LogIn } from 'lucide-react';
import { getNodeUrl } from '../utils/nodeUrl';
import calimeroLogo from '../assets/calimero-logo.svg';
import './ConnectPage.css';

interface LoginPageProps {
  onLogin: () => void;
  /** Clears stored tokens and re-runs the auth check. */
  onReset: () => void;
}

export default function LoginPage({ onLogin, onReset }: LoginPageProps) {
  return (
    <div className="connect-page" data-testid="login-screen">
      <div className="connect-card">
        <div className="connect-logo">
          <img src={calimeroLogo} alt="Calimero" className="connect-logo-img" />
          <span className="connect-logo-badge">Admin</span>
        </div>

        <div className="connect-body">
          <h1 className="connect-title">Admin Login</h1>
          <p className="connect-subtitle">Sign in to administer this node.</p>

          <div className="connect-actions">
            <button
              className="connect-btn"
              onClick={onLogin}
              data-testid="login-button"
            >
              <LogIn size={16} />
              Sign in
            </button>
            <button
              type="button"
              className="button button-secondary connect-secondary-btn"
              onClick={onReset}
            >
              Clear session
            </button>
          </div>

          {/* The node is not selectable — it is whichever node served this page.
              Showing it makes that obvious instead of leaving the user guessing. */}
          <p className="connect-hint">
            Node: <code>{getNodeUrl()}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
