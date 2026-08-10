import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSettings,
  saveSettings,
  updateSettings,
  clearLocalState,
  DEFAULT_REGISTRY_URL,
} from '../utils/settings';

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the Calimero registry and developer mode off', () => {
    const s = getSettings();
    expect(s.registries).toEqual([DEFAULT_REGISTRY_URL]);
    expect(s.developerMode).toBe(false);
  });

  it('round-trips through localStorage', () => {
    saveSettings({ registries: ['https://r.example/'], developerMode: true });
    const s = getSettings();
    expect(s.registries).toEqual(['https://r.example/']);
    expect(s.developerMode).toBe(true);
  });

  it('merges partial updates', () => {
    updateSettings({ developerMode: true });
    expect(getSettings().developerMode).toBe(true);
    expect(getSettings().registries).toEqual([DEFAULT_REGISTRY_URL]);
  });

  it('migrates the retired localhost registry', () => {
    localStorage.setItem(
      'calimero-admin-settings',
      JSON.stringify({ registries: ['http://localhost:8080'] }),
    );
    expect(getSettings().registries).toEqual([DEFAULT_REGISTRY_URL]);
  });

  it('drops duplicates that differ only by trailing slash', () => {
    saveSettings({
      registries: ['https://r.example', 'https://r.example/'],
      developerMode: false,
    });
    expect(getSettings().registries).toEqual(['https://r.example']);
  });

  it('never returns an empty registry list', () => {
    // A Marketplace with no registries has nothing to show and no way to
    // recover from the UI, so an empty list falls back to the default.
    saveSettings({ registries: [], developerMode: false });
    expect(getSettings().registries).toEqual([DEFAULT_REGISTRY_URL]);
  });

  it('ignores non-string and blank registry entries', () => {
    localStorage.setItem(
      'calimero-admin-settings',
      JSON.stringify({ registries: [null, '', 42, 'https://ok.example/'] }),
    );
    expect(getSettings().registries).toEqual(['https://ok.example/']);
  });

  it('survives corrupt stored JSON', () => {
    localStorage.setItem('calimero-admin-settings', '{not json');
    expect(getSettings().registries).toEqual([DEFAULT_REGISTRY_URL]);
  });

  it('carries no embedded-node fields', () => {
    // The desktop persists data dir / node name / ports for merod processes it
    // owns. A browser can neither create nor address those, so the shape must
    // not grow them back.
    saveSettings({ registries: [DEFAULT_REGISTRY_URL], developerMode: false });
    const keys = Object.keys(getSettings());
    expect(keys.sort()).toEqual(['developerMode', 'registries']);
    expect(keys.some((k) => k.startsWith('embeddedNode'))).toBe(false);
  });

  it('clearLocalState wipes storage', () => {
    saveSettings({ registries: ['https://r.example/'], developerMode: true });
    sessionStorage.setItem('x', 'y');
    clearLocalState();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(getSettings().developerMode).toBe(false);
  });
});
