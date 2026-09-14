/**
 * Reading the node's installed-application rows.
 *
 * Three surfaces need this now — the Marketplace listing (to mark cards), the
 * application detail page (to disable Install) and the Applications grid (to
 * render them) — so the response-shape handling lives here once.
 */

import { apiClient } from '@calimero-network/calimero-client';
import { decodeMetadata, type AppMetadata } from './appUtils';

export interface InstalledApplication {
  id: string;
  name?: string | null;
  version?: string | null;
  metadata?: number[] | string;
  size?: number;
  source?: string;
}

/**
 * `GET /admin-api/applications`, unwrapped.
 *
 * ⚠️ The payload has been served BOTH as `{ apps: [] }` and as
 * `{ data: { apps: [] } }` depending on the node version, so both are accepted
 * — reading only one shape yields an empty list against the other and looks
 * exactly like a node with nothing installed.
 */
export async function fetchInstalledApplications(): Promise<
  InstalledApplication[]
> {
  const res = await apiClient.node().getInstalledApplications();
  if (res.error) throw new Error(res.error.message);
  const raw = res.data as
    | { apps?: unknown[]; data?: { apps?: unknown[] } }
    | undefined;
  return (raw?.data?.apps ?? raw?.apps ?? []) as InstalledApplication[];
}

/**
 * The set of strings that identify what is installed, for matching against a
 * registry listing.
 *
 * ⚠️ THE NODE'S APPLICATION ID IS A CONTENT HASH AND NEVER EQUALS A REGISTRY
 * PACKAGE ID, so installed-state cannot be correlated on `id`. What does match
 * is the `package` and `name` the bundle recorded in its own metadata, plus the
 * `source` URL the node kept.
 */
export function installedKeySet(apps: InstalledApplication[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of apps) {
    const meta: AppMetadata | null = decodeMetadata(entry.metadata);
    if (meta?.name) keys.add(meta.name);
    if (meta?.package) keys.add(meta.package);
    if (entry.source) keys.add(entry.source);
  }
  return keys;
}
