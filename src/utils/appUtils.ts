/**
 * Application metadata helpers, ported from the desktop app
 * (tauri-app/apps/desktop/src/utils/appUtils.ts) so both surfaces read the
 * node's application rows identically.
 */

/**
 * The metadata JSON the node stores on an application row.
 *
 * For bundle (.mpk) installs this is produced verbatim by
 * `BundleManifest::to_metadata_json` in core (crates/bundle/src/lib.rs), which
 * emits a FLAT object with a nested `links` block:
 *
 *   { package, version, name, description, author, icon, tags, license,
 *     links: { frontend, github, docs } }
 *
 * The pre-bundle admin dashboard read a different, legacy schema
 * (`applicationName` / `applicationVersion` / `applicationUrl`), which meant
 * every bundle-installed app rendered with no name, no version, and no way to
 * reach its frontend. Do not reintroduce those keys.
 */
export interface AppMetadata {
  package?: string;
  version?: string;
  name?: string;
  alias?: string;
  description?: string;
  author?: string;
  /** Launcher icon as a `data:image/png;base64,…` URI. */
  icon?: string;
  tags?: string[];
  license?: string;
  links?: {
    frontend?: string;
    github?: string;
    docs?: string;
  };
}

/**
 * Decode application metadata from any of the shapes the node/SDK may hand us:
 * a base64 string, a `number[]` byte array, or an already-decoded object.
 *
 * Decoding goes through `TextDecoder('utf-8')` rather than `atob` alone —
 * `atob` yields Latin-1, which mangles multi-byte characters (an em-dash in a
 * description turns into mojibake).
 *
 * @returns the parsed metadata, or `null` when absent/undecodable.
 */
export function decodeMetadata(metadata: unknown): AppMetadata | null {
  if (!metadata) return null;

  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as AppMetadata;
  }

  try {
    let jsonString: string;

    if (typeof metadata === 'string') {
      const binary = atob(metadata);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      jsonString = new TextDecoder('utf-8').decode(bytes);
    } else if (Array.isArray(metadata)) {
      if (metadata.length === 0) return null;
      jsonString = new TextDecoder('utf-8').decode(
        new Uint8Array(metadata as number[]),
      );
    } else {
      return null;
    }

    return JSON.parse(jsonString) as AppMetadata;
  } catch {
    // Foreign or corrupt metadata must not break a list render.
    return null;
  }
}

/** Human-readable name for an application row, with graceful fallbacks. */
export function appDisplayName(
  app: { id?: string; name?: string | null },
  metadata: AppMetadata | null,
): string {
  return metadata?.name || metadata?.alias || app.name || app.id || 'Unknown';
}

/** The app's web frontend, if the bundle declared one. */
export function appFrontendUrl(metadata: AppMetadata | null): string | null {
  return metadata?.links?.frontend ?? null;
}

/**
 * Kebab-case a display name, matching the desktop's deep-link slug derivation.
 * "Mero Chat" -> "mero-chat".
 */
export function kebabCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Middle-truncate a long identifier for display. */
export function truncateId(id: string, head = 10, tail = 6): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/** Format a byte count the way the desktop's Applications table does. */
export function formatSize(bytes: number | undefined | null): string {
  if (!bytes) return '—';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(2)} KB` : `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Extract a human-readable message from an SDK/HTTP error.
 *
 * Ported from the desktop's Namespaces `parseApiError`: the SDK throws
 * `HTTPError`-shaped objects whose `bodyText` holds the node's JSON error, and
 * surfacing the raw object gives the user "[object Object]".
 */
export function parseApiError(e: unknown): string {
  if (!e) return 'Unknown error';
  const err = e as {
    status?: number;
    bodyText?: string;
    message?: string;
    body?: { error?: string };
  };
  const status = err.status ? `${err.status}: ` : '';
  const cap = (s: string) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

  if (typeof err.bodyText === 'string' && err.bodyText) {
    try {
      const p = JSON.parse(err.bodyText) as Record<string, unknown>;
      const human =
        p['error'] ?? p['message'] ?? p['msg'] ?? p['detail'] ?? p['reason'];
      if (human) return `${status}${String(human)}`;
      return `${status}${cap(JSON.stringify(p))}`;
    } catch {
      return `${status}${cap(err.bodyText.trim())}`;
    }
  }

  const msg = err.message ?? String(e);
  try {
    const p = JSON.parse(msg) as Record<string, unknown>;
    const human = p['error'] ?? p['message'] ?? p['msg'];
    if (human) return `${status}${String(human)}`;
  } catch {
    // message is not JSON — fall through
  }

  if (err.body?.error) return `${status}${String(err.body.error)}`;
  return `${status}${msg}`;
}
