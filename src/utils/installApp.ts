/**
 * Installing a registry bundle onto the node.
 *
 * Lifted out of `pages/Marketplace.tsx` when the detail modal became a real
 * page: two surfaces now offer an Install button.
 */

import { getAccessToken } from '@calimero-network/calimero-client';
import { getNodeUrl } from './nodeUrl';
import { recordDownload, type AppSummary } from './registry';

/**
 * Install one version of a package onto the connected node, BY COORDINATES.
 *
 * Since core 0.11.0-rc.31 `POST /admin-api/install-application` takes exactly
 * `{ package, version }` (`deny_unknown_fields`) and the node fetches the
 * bundle from its OWN configured `[registry]`. The old body — a download `url`
 * plus metadata and a hash, which the SDK's `installApplication` still sends —
 * is refused outright ("unknown field `url`"), so Install could not work
 * against any current node. It was also the weaker design: the dashboard chose
 * the URL the node downloaded from.
 *
 * The node's registry may differ from the one this listing came from; a
 * package it does not know is answered with a 502 naming the coordinates,
 * which is surfaced as-is.
 *
 * Throws on failure; the caller decides how to surface it.
 */
export async function installApplication(
  app: AppSummary & { registry: string },
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!/^[\w.+-]+$/.test(version)) {
    throw new Error('Invalid version string');
  }

  const res = await fetchImpl(`${getNodeUrl()}/admin-api/install-application`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken() ?? ''}`,
    },
    body: JSON.stringify({ package: app.id, version }),
  });

  // Success is `{ data: { applicationId } }`; failures are a plain-text body
  // (502 not published, 500 install error) or a JSON `{ error }`.
  const text = await res.text();
  let json: {
    data?: { applicationId?: string };
    error?: string | { message?: string };
  } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = json?.error;
    const detail =
      (typeof err === 'string' ? err : err?.message) ||
      text.trim() ||
      `HTTP ${res.status}`;
    throw new Error(detail);
  }

  const applicationId = json?.data?.applicationId;
  if (!applicationId) {
    throw new Error('The node answered without an application id');
  }

  recordDownload(app.registry, app.id, version);
  return applicationId;
}

/** The registry's own web page for a package, for "View on Registry". */
export function registryAppUrl(registry: string, packageId: string): string {
  const base = (() => {
    try {
      return new URL(registry).origin;
    } catch {
      return registry.replace(/\/+$/, '');
    }
  })();
  return `${base}/apps/${encodeURIComponent(packageId)}`;
}

/**
 * An organization's page on the registry's own site, for the app page's
 * Organization row. Same origin rule as `registryAppUrl`: a registry configured
 * with a path would otherwise produce `<path>/orgs/<id>`, which is not served.
 */
export function registryOrgUrl(registry: string, orgId: string): string {
  const base = (() => {
    try {
      return new URL(registry).origin;
    } catch {
      return registry.replace(/\/+$/, '');
    }
  })();
  return `${base}/orgs/${encodeURIComponent(orgId)}`;
}
