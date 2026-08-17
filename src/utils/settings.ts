/**
 * Local dashboard preferences, ported from the desktop's utils/settings.ts.
 *
 * Every `embeddedNode*` field is deliberately absent: the desktop persists the
 * data directory, node name, server port and swarm port of merod processes it
 * owns, none of which a browser can create, start or address. The node this
 * dashboard talks to comes from utils/nodeUrl.ts and is not user-configurable.
 */

export interface AppSettings {
  /** Registry base URLs browsed by the Marketplace. */
  registries: string[];
  /** Reveals the Node diagnostics page; forwarded to apps as `dev_mode=1`. */
  developerMode: boolean;
}

const SETTINGS_KEY = 'calimero-admin-settings';

export const DEFAULT_REGISTRY_URL = 'https://apps.calimero.network/';

/** Registry URLs superseded by DEFAULT_REGISTRY_URL, migrated away on read. */
const LEGACY_REGISTRY_URLS = ['http://localhost:8080'];

const DEFAULTS: AppSettings = {
  registries: [DEFAULT_REGISTRY_URL],
  developerMode: false,
};

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function readRaw(): Partial<AppSettings> | null {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? (JSON.parse(stored) as Partial<AppSettings>) : null;
  } catch {
    return null;
  }
}

/**
 * Replace retired registry URLs and drop duplicates/blanks. An empty list falls
 * back to the default so the Marketplace is never dead on arrival.
 */
function migrateRegistries(registries: unknown): string[] {
  if (!Array.isArray(registries) || registries.length === 0) {
    return [...DEFAULTS.registries];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of registries) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const url = LEGACY_REGISTRY_URLS.includes(normalize(entry))
      ? DEFAULT_REGISTRY_URL
      : entry;
    const key = normalize(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out.length > 0 ? out : [...DEFAULTS.registries];
}

export function getSettings(): AppSettings {
  const raw = readRaw();
  if (!raw) return { ...DEFAULTS, registries: [...DEFAULTS.registries] };
  return {
    registries: migrateRegistries(raw.registries),
    developerMode: raw.developerMode ?? DEFAULTS.developerMode,
  };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/** Merge a partial update into the stored settings and return the result. */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  saveSettings(next);
  return next;
}

/**
 * Clear this origin's dashboard state: settings, theme, caches and tokens.
 *
 * This is the web analogue of the desktop's "Reset app" and is explicitly NOT
 * its "Total nuke" — it cannot and must not touch node data, which lives on the
 * server. Callers should reload afterwards.
 */
export function clearLocalState(): void {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (error) {
    console.error('Failed to clear local state:', error);
  }
}
