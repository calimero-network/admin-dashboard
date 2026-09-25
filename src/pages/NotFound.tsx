import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import AppShell from '../components/AppShell';
import notFoundArt from '../assets/not-found.svg?raw';
import './NotFound.css';

/**
 * calimero.network's 404: the landing's own line drawing, an eyebrow, the
 * title and a way back. The drawing is inlined (not an <img>) so its lime and
 * white fills can follow the theme — see NotFound.css.
 */
export default function NotFound() {
  const navigate = useNavigate();

  return (
    <AppShell title="Not Found">
      <div className="not-found">
        <div
          className="not-found-art"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: notFoundArt }}
        />
        <span className="eyebrow not-found-eyebrow">Error 404</span>
        <h1 className="not-found-title">Page not found</h1>
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
