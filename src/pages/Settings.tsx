import React, { useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import {
  getSettings,
  updateSettings,
  clearLocalState,
  DEFAULT_REGISTRY_URL,
} from '../utils/settings';
import { invalidateMarketplaceCache } from '../utils/marketplaceCache';
import { getAdminApiUrl, getNodeUrl } from '../utils/nodeUrl';
import { DASHBOARD_BUILD } from '../utils/version';
import './Settings.css';

type Tab = 'general' | 'registries' | 'about';

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [settings, setSettings] = useState(getSettings);
  const [newRegistryUrl, setNewRegistryUrl] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const handleDeveloperModeToggle = () => {
    const developerMode = !settings.developerMode;
    setSettings(updateSettings({ developerMode }));
    toast.success(`Developer mode ${developerMode ? 'enabled' : 'disabled'}`);
  };

  const handleAddRegistry = () => {
    const url = newRegistryUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error(
        'Enter a valid absolute URL, e.g. https://apps.calimero.network/',
      );
      return;
    }
    const normalized = (u: string) => u.replace(/\/+$/, '');
    if (settings.registries.some((r) => normalized(r) === normalized(url))) {
      toast.warning('That registry is already configured');
      return;
    }
    setSettings(updateSettings({ registries: [...settings.registries, url] }));
    setNewRegistryUrl('');
    // The cache is keyed on the registry list; a new registry must not serve
    // results from the old one.
    invalidateMarketplaceCache();
    toast.success('Registry added');
  };

  const handleRemoveRegistry = (index: number) => {
    const registries = settings.registries.filter((_, i) => i !== index);
    setSettings(updateSettings({ registries }));
    invalidateMarketplaceCache();
    toast.success('Registry removed');
  };

  return (
    <div className="settings-page">
      <main className="settings-main">
        <h1 className="settings-title">Settings</h1>

        <div className="settings-tabs" role="tablist">
          {(
            [
              ['general', 'General'],
              ['registries', 'Registries'],
              ['about', 'About'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`settings-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'general' && (
          <div className="settings-content">
            <div className="settings-card">
              <h2>Appearance</h2>
              <div className="settings-field">
                <span className="settings-field-label">Dark Mode</span>
                <div className="toggle-switch">
                  <input
                    id="theme-toggle"
                    type="checkbox"
                    aria-label="Dark Mode"
                    checked={theme === 'dark'}
                    onChange={() => toggleTheme()}
                  />
                  <label htmlFor="theme-toggle" className="toggle-label">
                    <span className="toggle-slider" />
                    <span className="toggle-text">
                      {theme === 'dark' ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
                <p className="field-hint">
                  Choose between light and dark theme.
                </p>
              </div>
            </div>

            <div className="settings-card">
              <h2>Advanced</h2>
              <div className="settings-field">
                <span className="settings-field-label">Developer Mode</span>
                <div className="toggle-switch">
                  <input
                    id="developer-mode"
                    type="checkbox"
                    aria-label="Developer Mode"
                    checked={settings.developerMode}
                    onChange={handleDeveloperModeToggle}
                  />
                  <label htmlFor="developer-mode" className="toggle-label">
                    <span className="toggle-slider" />
                    <span className="toggle-text">
                      {settings.developerMode ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
                <p className="field-hint">
                  Shows the Node diagnostics page, and tells applications opened
                  from here to surface their own advanced panels.
                </p>
              </div>

              <div className="settings-field settings-field-separated">
                <span className="settings-field-label">
                  Reset dashboard state
                </span>
                <p className="field-hint" style={{ marginBottom: '8px' }}>
                  Clears settings, theme, marketplace cache and your session for
                  this browser. Node data is untouched — it lives on the node,
                  and this dashboard has no way to delete it.
                </p>
                {!showResetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="button button-danger"
                  >
                    <RotateCcw size={14} />
                    Reset local state
                  </button>
                ) : (
                  <div className="reset-confirm-form">
                    <p className="reset-confirm-warning">
                      You will be signed out of the dashboard and returned to
                      the login screen.
                    </p>
                    <label className="reset-confirm-checkbox">
                      <input
                        type="checkbox"
                        checked={resetConfirmed}
                        onChange={(e) => setResetConfirmed(e.target.checked)}
                      />
                      <span>I understand this signs me out</span>
                    </label>
                    <div className="reset-confirm-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setShowResetConfirm(false);
                          setResetConfirmed(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button button-danger"
                        disabled={!resetConfirmed}
                        onClick={() => {
                          clearLocalState();
                          window.location.reload();
                        }}
                      >
                        <Trash2 size={14} />
                        Confirm reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'registries' && (
          <div className="settings-content">
            <div className="settings-card">
              <h2>Application Registries</h2>
              <p className="field-hint" style={{ marginBottom: '16px' }}>
                The Marketplace browses every registry listed here. Changes are
                saved automatically.
              </p>

              <div className="settings-field">
                <label htmlFor="registry-url">Registry URL</label>
                <div className="input-group">
                  <input
                    id="registry-url"
                    type="text"
                    value={newRegistryUrl}
                    onChange={(e) => setNewRegistryUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddRegistry();
                    }}
                    placeholder={DEFAULT_REGISTRY_URL}
                  />
                  <button
                    onClick={handleAddRegistry}
                    className="button button-primary"
                    disabled={!newRegistryUrl.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>

              {settings.registries.length > 0 && (
                <div className="settings-field">
                  <label>Configured Registries</label>
                  <div className="registry-list">
                    {settings.registries.map((url, index) => (
                      <div key={url} className="registry-item">
                        <span className="registry-url">{url}</span>
                        <button
                          onClick={() => handleRemoveRegistry(index)}
                          className="button button-danger button-small"
                          disabled={settings.registries.length === 1}
                          title={
                            settings.registries.length === 1
                              ? 'At least one registry is required'
                              : 'Remove registry'
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="settings-content">
            <div className="settings-card">
              <h2>About</h2>
              <div className="settings-field">
                <div className="settings-version-row">
                  <span className="settings-field-label">Dashboard build</span>
                  <span className="settings-version mono">
                    {DASHBOARD_BUILD}
                  </span>
                </div>
                <div className="settings-version-row">
                  <span className="settings-field-label">Node URL</span>
                  <span className="settings-version mono">{getNodeUrl()}</span>
                </div>
                <div className="settings-version-row">
                  <span className="settings-field-label">Admin API</span>
                  <span className="settings-version mono">
                    {getAdminApiUrl()}
                  </span>
                </div>
                <p className="field-hint">
                  This dashboard is served by the node it administers, so it is
                  bound to exactly one node and there is nothing to configure
                  here. To manage several nodes, or to read node logs, use
                  Calimero Desktop.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
