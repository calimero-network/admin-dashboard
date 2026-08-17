import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import AppShell from '../components/AppShell';
import './NotFound.css';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <AppShell title="Not Found">
      <div className="not-found">
        <div className="not-found-icon-wrap">
          <AlertTriangle className="not-found-icon" />
        </div>
        <h1 className="not-found-title">404</h1>
        <p className="not-found-message">
          This page doesn’t exist or you don’t have access to it.
        </p>
        <button
          type="button"
          className="button button-primary not-found-btn"
          onClick={() => navigate('/dashboard')}
        >
          <Home className="not-found-btn-icon" size={16} />
          Back to Dashboard
        </button>
      </div>
    </AppShell>
  );
}
