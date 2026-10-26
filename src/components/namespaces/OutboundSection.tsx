import React, { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  listOutboundApprovals,
  setOutboundApproval,
  type OutboundApproval,
} from '../../api/namespaceApi';
import {
  outboundRows,
  withPrefix,
  withoutPrefix,
  type OutboundStatus,
} from '../../utils/outbound';
import type { InstalledApp } from './CreateContextPanel';
import {
  ConfirmButton,
  CopyBtn,
  errorMessage,
  truncate,
  type ShowToast,
} from './shared';

const STATUS_LABEL: Record<OutboundStatus, string> = {
  approved: 'Approved',
  revoked: 'Revoked',
  awaiting: 'Awaiting approval',
};

const STATUS_TITLE: Record<OutboundStatus, string> = {
  approved: 'Requests under this prefix may go out.',
  revoked:
    'An admin was shown this prefix and left it out, or revoked it. Requests answer NotApproved.',
  awaiting:
    'The installed app declares this prefix and nobody has approved it yet. Requests answer AwaitingApproval.',
};

/**
 * "Outbound access": which URL prefixes this namespace lets each publisher's
 * apps send HTTPS requests under.
 *
 * The approval is per PUBLISHER (the bundle's signer), not per app, and the
 * only way to change one is `PUT …/outbound-approvals` with an installed
 * `applicationId` the node resolves the publisher from. This page uses the
 * namespace's target application, so only the row of ITS publisher is
 * editable; any other publisher's approval is shown read-only.
 *
 * The PUT sets the list exactly, so every action sends the full new list.
 */
export function OutboundSection({
  namespaceId,
  targetApplicationId,
  installedApps,
  showToast,
}: {
  namespaceId: string;
  targetApplicationId: string;
  installedApps: InstalledApp[];
  showToast: ShowToast;
}) {
  const [approvals, setApprovals] = useState<OutboundApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const targetApp = installedApps.find((a) => a.id === targetApplicationId);
  const targetSigner = targetApp?.signerId ?? null;
  const declared = targetApp?.outbound ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApprovals(await listOutboundApprovals(namespaceId));
      setError(null);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to load outbound approvals'));
    } finally {
      setLoading(false);
    }
  }, [namespaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // The target app's publisher may have no approval yet (the namespace was
  // created without one, or by an older node). Its declared prefixes still
  // belong on screen, as awaiting approval, so an admin can approve them here.
  const entries: OutboundApproval[] =
    targetSigner &&
    declared.length > 0 &&
    !approvals.some((a) => a.signer === targetSigner)
      ? [...approvals, { signer: targetSigner, prefixes: [], reviewed: [] }]
      : approvals;

  // Nothing approved, nothing declared: this namespace's app makes no outbound
  // requests, which is the common case, and an empty section would only be
  // noise. A failed load is shown only when there is something it would hide.
  if (!loading && entries.length === 0 && (!error || declared.length === 0)) {
    return null;
  }

  const apply = async (
    entry: OutboundApproval,
    prefix: string,
    next: string[],
    verb: 'revoked' | 'approved',
  ) => {
    setBusy(`${entry.signer}\n${prefix}`);
    try {
      const result = await setOutboundApproval(namespaceId, {
        applicationId: targetApplicationId,
        approve: next,
      });
      setApprovals((prev) => {
        const updated: OutboundApproval = {
          signer: result.signer || entry.signer,
          prefixes: result.prefixes ?? next,
          reviewed: result.reviewed ?? entry.reviewed,
        };
        return prev.some((a) => a.signer === updated.signer)
          ? prev.map((a) => (a.signer === updated.signer ? updated : a))
          : [...prev, updated];
      });
      showToast(
        result.published === false
          ? 'Nothing changed'
          : `${prefix} ${verb}. Takes effect at the next run.`,
        'success',
      );
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to update outbound access'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ns-section" data-testid="ns-outbound-section">
      <div className="ns-section-header">
        <h2>Outbound access</h2>
        <div className="ns-section-actions">
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 14, height: 14 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
        </div>
      </div>
      <p className="ns-muted ns-outbound-hint">
        URL prefixes this namespace lets each publisher&apos;s apps send HTTPS
        requests under. A request also needs the publisher to declare the prefix
        and the node&apos;s operator to allow the host. Changes take effect at
        the next run.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {!targetApp && entries.length > 0 && (
        <p className="ns-muted ns-outbound-hint">
          This namespace&apos;s application is not installed on this node, so
          approvals can be viewed here but not changed.
        </p>
      )}

      {loading && entries.length === 0 ? (
        <p className="ns-muted">Loading outbound approvals…</p>
      ) : (
        entries.map((entry) => {
          const own =
            !!targetApp && !!targetSigner && entry.signer === targetSigner;
          const rows = outboundRows(entry, own ? declared : []);
          return (
            <div
              key={entry.signer}
              className="ns-outbound-publisher"
              data-testid="ns-outbound-publisher"
            >
              <div className="ns-kv-row">
                <span
                  className="ns-kv-label"
                  title="The bundle's signer. An approval is keyed by it, so an app signed by someone else starts with nothing approved."
                >
                  Publisher
                </span>
                <span className="ns-kv-value mono">
                  <span title={entry.signer}>{truncate(entry.signer, 40)}</span>
                  <CopyBtn value={entry.signer} />
                  {own && (
                    <span className="ns-badge">
                      {targetApp?.name ?? 'this namespace’s app'}
                    </span>
                  )}
                </span>
              </div>
              {!own && targetApp && (
                <p className="ns-muted ns-outbound-hint">
                  Not the publisher of this namespace&apos;s application, so it
                  can only be changed through an installed app it signed.
                </p>
              )}
              {rows.length === 0 ? (
                <p className="ns-muted">Nothing approved.</p>
              ) : (
                <table className="ns-table">
                  <thead>
                    <tr>
                      <th>Prefix</th>
                      <th>Status</th>
                      {own && <th className="ns-table-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const key = `${entry.signer}\n${row.prefix}`;
                      return (
                        <tr key={row.prefix} data-testid="ns-outbound-row">
                          <td className="mono ns-outbound-prefix">
                            {row.prefix}
                          </td>
                          <td>
                            <span
                              className="ns-badge ns-outbound-status"
                              data-status={row.status}
                              title={STATUS_TITLE[row.status]}
                            >
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          {own && (
                            <td className="ns-table-right">
                              <span className="ns-row-actions">
                                {row.status === 'approved' ? (
                                  <ConfirmButton
                                    label="Revoke"
                                    confirmLabel="Confirm revoke"
                                    busyLabel="Revoking…"
                                    busy={busy === key}
                                    disabled={busy !== null}
                                    title={`Refuse requests to ${row.prefix}`}
                                    onConfirm={() =>
                                      apply(
                                        entry,
                                        row.prefix,
                                        withoutPrefix(
                                          entry.prefixes,
                                          row.prefix,
                                        ),
                                        'revoked',
                                      )
                                    }
                                  />
                                ) : (
                                  <button
                                    className="btn btn-sm"
                                    disabled={busy !== null}
                                    title={`Allow requests to ${row.prefix}`}
                                    onClick={() =>
                                      apply(
                                        entry,
                                        row.prefix,
                                        withPrefix(entry.prefixes, row.prefix),
                                        'approved',
                                      )
                                    }
                                  >
                                    {busy === key
                                      ? 'Approving…'
                                      : row.status === 'revoked'
                                        ? 'Re-approve'
                                        : 'Approve'}
                                  </button>
                                )}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
