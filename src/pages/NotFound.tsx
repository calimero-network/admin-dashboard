import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Navigation } from '../components/Navigation';
import './NotFound.css';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="not-found">
          <div className="not-found-icon-wrap">
            <ExclamationTriangleIcon className="not-found-icon" />
          </div>
          <h1 className="not-found-title">404</h1>
          <p className="not-found-message">
            This page doesn’t exist or you don’t have access to it.
          </p>
          <button
            type="button"
            className="btn btn-primary not-found-btn"
            onClick={() => navigate('/dashboard')}
          >
            <HomeIcon className="not-found-btn-icon" />
            Back to Dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
