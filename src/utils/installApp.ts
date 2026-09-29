/**
 * Installing a registry bundle onto the node.
 *
 * Lifted out of `pages/Marketplace.tsx` when the detail modal became a real
 * page: two surfaces now offer an Install button.
 */

import { getAccessToken } from '@calimero-network/calimero-client';
import { getNodeUrl } from './nodeUrl';
import { recordDownload, type AppSummary } from './registry';

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
