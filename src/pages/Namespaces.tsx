import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@calimero-network/calimero-client';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronRightIcon,
  CubeIcon,
  FolderIcon,
  FolderPlusIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  createGroupInNamespace,
  createGroupInvitation,
  createNamespace,
  createNamespaceInvitation,
  createSubgroup,
  deleteContext,
  deleteGroup,
  deleteNamespace,
  getGroupInfo,
  joinGroup,
  joinNamespace,
  leaveGroup,
  leaveNamespace,
  listGroupContexts,
  listNamespaces,
  listSubgroups,
  setContextMetadata,
  setGroupMetadata,
  setSubgroupVisibility,
  type GroupContextEntry,
  type GroupInfo,
  type GroupMembersResult,
  type Namespace,
  type SubgroupEntry,
  type SubgroupVisibility,
  type UpgradePolicy,
} from '../api/namespaceApi';
import { namespaceIdFromInvitation } from '../utils/invitations';
import {
  CreateContextPanel,
  type InstalledApp,
} from '../components/namespaces/CreateContextPanel';
import { InvitePanel, JoinPanel } from '../components/namespaces/InvitePanel';
import { MembersSection } from '../components/namespaces/MembersSection';
import { useNodeIdentity } from '../components/namespaces/useNodeIdentity';
import { StructureTree } from '../components/namespaces/StructureTree';
import {
  ConfirmButton,
  CopyBtn,
  RenameField,
  errorMessage,
  truncate,
  type ShowToast,
} from '../components/namespaces/shared';
import {
  countTreeContexts,
  countTreeSubgroups,
  useNamespaceTree,
} from '../components/namespaces/useNamespaceTree';
import './NamespacesPage.css';

/**
 * Namespaces — the single place where the node's group hierarchy is managed.
 *
 * The model this page mirrors (and the reason there is no separate Contexts
 * tab): a NAMESPACE is a root group bound to one application. It holds
 * CONTEXTS (running instances of that app) and SUBGROUPS, and each subgroup
 * holds its own contexts and subgroups. A context always belongs to exactly
 * one group, so listing contexts node-globally showed them detached from the
 * only thing that gives them meaning — and the two tabs could not be mapped
 * onto each other 1:1.
 */

type View =
  | { type: 'list' }
  | { type: 'namespace'; ns: Namespace }
  | { type: 'group'; ns: Namespace; groupId: string };

interface Toast {
  msg: string;
  type: 'success' | 'error';
}

/**
 * What to call a namespace.
 *
 * A namespace is only named if someone named it — the node stores no default —
 * so fall back to the APPLICATION it is bound to before showing a raw id. A
 * namespace exists to run one application, so "Mero Chat" is a true and useful
 * label; `ns11111111…` is neither. Mirrors the desktop's `nsDisplayName`.
 */
export function namespaceLabel(
  ns: Namespace,
  installedApps: InstalledApp[],
): string {
  if (ns.name) return ns.name;
  const app = installedApps.find((a) => a.id === ns.targetApplicationId);
  if (app && app.name !== app.id) return app.name;
  return truncate(ns.namespaceId, 20);
}

const UPGRADE_POLICIES: Array<{ value: UpgradePolicy; label: string }> = [
  // `Coordinated` existed in an older node and was removed — offering it only
  // produces a 400.
  {
    value: 'Automatic',
    label: 'Automatic — upgrade as soon as a new version lands',
  },
  { value: 'LazyOnAccess', label: 'LazyOnAccess — upgrade on next use' },
];

function useInstalledApps(): InstalledApp[] {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  useEffect(() => {
    apiClient
      .node()
      .getInstalledApplications()
      .then((res) => {
        const list: Array<{ id: string; metadata?: number[] }> =
          (res.data as any)?.data?.apps ?? (res.data as any)?.apps ?? [];
        setApps(
          list.map((app) => {
            let name = app.id;
            try {
              const decoded = JSON.parse(
                new TextDecoder().decode(new Uint8Array(app.metadata ?? [])),
              );
              if (decoded?.name) name = decoded.name;
            } catch {
              // raw-wasm app or no metadata — the id is the best we have
            }
            return { id: app.id, name };
          }),
        );
      })
      .catch(() => setApps([]));
  }, []);
  return apps;
}

export default function NamespacesPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [toast, setToast] = useState<Toast | null>(null);
  const installedApps = useInstalledApps();

  const showToast = useCallback<ShowToast>((msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const goBack = () => {
    if (view.type === 'group') setView({ type: 'namespace', ns: view.ns });
    else if (view.type === 'namespace') setView({ type: 'list' });
  };

  return (
    <main className="page-content">
      {toast && (
        <div className={`alert alert-${toast.type} ns-toast`}>{toast.msg}</div>
      )}
      {view.type === 'list' && (
        <NamespaceList
          installedApps={installedApps}
          onOpen={(ns) => setView({ type: 'namespace', ns })}
          showToast={showToast}
        />
      )}
      {view.type === 'namespace' && (
        <NamespaceDetail
          key={view.ns.namespaceId}
          ns={view.ns}
          installedApps={installedApps}
          onBack={goBack}
          onGone={() => setView({ type: 'list' })}
          onOpenGroup={(groupId) =>
            setView({ type: 'group', ns: view.ns, groupId })
          }
          showToast={showToast}
        />
      )}
      {view.type === 'group' && (
        <GroupDetail
          key={view.groupId}
          ns={view.ns}
          groupId={view.groupId}
          installedApps={installedApps}
          onBack={goBack}
          onGone={() => setView({ type: 'namespace', ns: view.ns })}
          onOpenSubgroup={(groupId) =>
            setView({ type: 'group', ns: view.ns, groupId })
          }
          showToast={showToast}
        />
      )}
    </main>
  );
}

// ── Namespace list ──────────────────────────────────────────────────────────

function NamespaceList({
  installedApps,
  onOpen,
  showToast,
}: {
  installedApps: InstalledApp[];
  onOpen: (ns: Namespace) => void;
  showToast: ShowToast;
}) {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [appId, setAppId] = useState('');
  const [policy, setPolicy] = useState<UpgradePolicy>('Automatic');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNamespaces(await listNamespaces());
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to load namespaces'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const appName = (id: string) =>
    installedApps.find((a) => a.id === id)?.name ?? null;

  const create = async () => {
    if (!appId.trim()) return;
    setCreating(true);
    try {
      const result = await createNamespace({
        applicationId: appId.trim(),
        upgradePolicy: policy,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      showToast(
        `Namespace created: ${truncate(result.namespaceId)}`,
        'success',
      );
      setShowCreate(false);
      setAppId('');
      setName('');
      await load();
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to create namespace'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (ns: Namespace) => {
    setDeleting(ns.namespaceId);
    try {
      await deleteNamespace(ns.namespaceId);
      showToast('Namespace deleted', 'success');
      await load();
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to delete namespace'), 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Namespaces</h1>
          <p>
            A namespace is an app-bound workspace. It holds contexts (running
            app instances) and subgroups (nested groups with their own
            contexts).
          </p>
        </div>
        <div className="ns-header-actions">
          <button className="btn" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 16, height: 16 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
          <button className="btn" onClick={() => setShowJoin((v) => !v)}>
            <ArrowRightOnRectangleIcon style={{ width: 16, height: 16 }} />
            Join Namespace
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((v) => !v)}
            disabled={installedApps.length === 0}
            title={
              installedApps.length === 0
                ? 'Install an application first (Marketplace)'
                : 'Create a namespace'
            }
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            Create Namespace
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showJoin && (
        <JoinPanel
          title="Join a namespace"
          hint="Paste an invitation code. The namespace it belongs to is read from the code itself."
          confirmLabel="Join"
          showToast={showToast}
          onClose={() => setShowJoin(false)}
          onJoin={async (payload) => {
            // A joiner does not know the namespace id — it is carried, signed,
            // inside the invitation, and the join route is addressed by it.
            const namespaceId = namespaceIdFromInvitation(payload);
            await joinNamespace(namespaceId, payload);
            showToast('Joined namespace', 'success');
            setShowJoin(false);
            await load();
          }}
        />
      )}

      {showCreate && (
        <div className="ns-panel">
          <div className="ns-panel-header">
            <h3>Create namespace</h3>
          </div>
          <div className="ns-form">
            <label className="ns-form-field">
              <span>Application</span>
              <select
                className="ns-input"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
              >
                <option value="">Select an installed application…</option>
                {installedApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name !== app.id
                      ? `${app.name} — ${app.id.slice(0, 12)}…`
                      : app.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="ns-form-field">
              <span>Upgrade policy</span>
              <select
                className="ns-input"
                value={policy}
                onChange={(e) => setPolicy(e.target.value as UpgradePolicy)}
              >
                {UPGRADE_POLICIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ns-form-field">
              <span>Name (optional)</span>
              <input
                className="ns-input"
                type="text"
                placeholder="e.g. Team workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <div className="ns-panel-actions">
            <button
              className="btn btn-primary"
              onClick={create}
              disabled={creating || !appId.trim()}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button className="btn" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && namespaces.length === 0 ? (
        <div className="ns-card-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ns-card ns-card-skeleton">
              <div className="skel-line skel-title" />
              <div className="skel-line skel-short" />
            </div>
          ))}
        </div>
      ) : namespaces.length === 0 ? (
        <div className="empty-state">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
            />
          </svg>
          <h3>No namespaces found</h3>
          <p>
            {installedApps.length === 0
              ? 'Install an application first, then create a namespace bound to it.'
              : 'Create a namespace bound to an installed application, then create a context inside it.'}
          </p>
        </div>
      ) : (
        <div className="ns-card-grid">
          {namespaces.map((ns) => (
            <div
              key={ns.namespaceId}
              className="ns-card"
              role="button"
              tabIndex={0}
              data-testid="ns-card"
              onClick={() => onOpen(ns)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onOpen(ns);
              }}
            >
              <div className="ns-card-header">
                <h3>{namespaceLabel(ns, installedApps)}</h3>
                <ChevronRightIcon className="ns-card-chevron" />
              </div>
              <div
                className="ns-card-id mono"
                title={ns.namespaceId}
                onClick={(e) => e.stopPropagation()}
              >
                {truncate(ns.namespaceId)}
                <CopyBtn value={ns.namespaceId} />
              </div>
              <div className="ns-card-app" title={ns.targetApplicationId}>
                {appName(ns.targetApplicationId) ??
                  truncate(ns.targetApplicationId)}
                {ns.appVersion && (
                  <span className="ns-card-version">v{ns.appVersion}</span>
                )}
              </div>
              <div className="ns-card-stats">
                <span title="Subgroups — nested groups, each holding its own contexts">
                  <FolderIcon /> {ns.subgroupCount}
                </span>
                <span title="Members — identities with access to this namespace">
                  <UsersIcon /> {ns.memberCount}
                </span>
                <span title="Contexts — running app instances directly under the namespace">
                  <CubeIcon /> {ns.contextCount}
                </span>
              </div>
              <div
                className="ns-card-footer"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="ns-badge">{ns.upgradePolicy}</span>
                <ConfirmButton
                  label="Delete"
                  busyLabel="Deleting…"
                  busy={deleting === ns.namespaceId}
                  onConfirm={() => remove(ns)}
                  icon={<TrashIcon style={{ width: 13, height: 13 }} />}
                  title="Delete namespace"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Create-subgroup form ────────────────────────────────────────────────────

function CreateSubgroupPanel({
  onClose,
  onSubmit,
  showToast,
  /** Only the namespace-level endpoint takes a birth visibility. */
  withVisibility,
}: {
  onClose: () => void;
  onSubmit: (name: string, visibility: SubgroupVisibility) => Promise<void>;
  showToast: ShowToast;
  withVisibility: boolean;
}) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<SubgroupVisibility>('open');
  const [busy, setBusy] = useState(false);

  return (
    <div className="ns-panel" data-testid="ns-create-subgroup-panel">
      <div className="ns-panel-header">
        <h3>New subgroup</h3>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="ns-form">
        <label className="ns-form-field">
          <span>Name (optional)</span>
          <input
            className="ns-input"
            type="text"
            placeholder="e.g. engineering"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {withVisibility && (
          <label className="ns-form-field">
            <span>Visibility</span>
            <select
              className="ns-input"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as SubgroupVisibility)
              }
            >
              <option value="open">
                Open — parent members can join automatically
              </option>
              <option value="restricted">Restricted — invite only</option>
            </select>
          </label>
        )}
      </div>
      <div className="ns-panel-actions">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(name.trim(), visibility);
            } catch (e: unknown) {
              showToast(errorMessage(e, 'Failed to create subgroup'), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Creating…' : 'Create Subgroup'}
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Panel =
  | 'invite'
  | 'join-context'
  | 'create-context'
  | 'create-subgroup'
  | null;

// ── Namespace detail ────────────────────────────────────────────────────────

function NamespaceDetail({
  ns: initialNs,
  installedApps,
  onBack,
  onGone,
  onOpenGroup,
  showToast,
}: {
  ns: Namespace;
  installedApps: InstalledApp[];
  onBack: () => void;
  onGone: () => void;
  onOpenGroup: (groupId: string) => void;
  showToast: ShowToast;
}) {
  const [ns, setNs] = useState(initialNs);
  // Node-level, not per-namespace. `GET /namespaces/:id/identity` is gone
  // (core #3522): it took a namespace and answered with the node's account
  // whichever one you passed, because every namespace on a node resolves to the
  // same account. `GET /admin-api/identity` says that plainly.
  const identity = useNodeIdentity();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [treeVersion, setTreeVersion] = useState(0);
  const [self, setSelf] = useState<GroupMembersResult | null>(null);

  const refreshTree = useCallback(() => setTreeVersion((v) => v + 1), []);
  const {
    tree,
    loading: treeLoading,
    partial,
  } = useNamespaceTree(ns.namespaceId, treeVersion);

  const appName = installedApps.find(
    (a) => a.id === ns.targetApplicationId,
  )?.name;

  // Delete is admin-gated on the node; a plain member's only exit is Leave.
  // While the role is still unknown, keep offering Delete — the node enforces
  // it anyway, so the worst case is an error toast rather than a hidden action.
  //
  // Our own row is found by ACCOUNT. The member list used to carry a
  // `selfIdentity` field and rc.23 removed it, so the match is against the
  // node's own account id — which is what the rows are keyed by anyway.
  const myRole = identity
    ? self?.members.find((m) => m.identity === identity.accountId)?.role
    : undefined;
  const showLeave =
    myRole !== undefined && String(myRole).toLowerCase() !== 'admin';

  const contextCount = tree ? countTreeContexts(tree) : ns.contextCount;
  const subgroupCount = tree ? countTreeSubgroups(tree) : ns.subgroupCount;

  const rename = async (name: string) => {
    setBusy(true);
    try {
      // A namespace IS a group (the root one), so its name is group metadata.
      await setGroupMetadata(ns.namespaceId, { name });
      setNs((prev) => ({ ...prev, name }));
      showToast('Namespace renamed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to rename namespace'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeNamespace = async () => {
    setBusy(true);
    try {
      await deleteNamespace(ns.namespaceId);
      showToast('Namespace deleted', 'success');
      onGone();
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to delete namespace'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await leaveNamespace(ns.namespaceId);
      showToast('Left namespace', 'success');
      onGone();
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to leave namespace'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn ns-back-btn" onClick={onBack}>
            <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            Back
          </button>
          <div>
            <h1>
              {namespaceLabel(ns, installedApps)}
              <RenameField
                value={ns.name}
                placeholder="Namespace name"
                busy={busy}
                onSave={rename}
              />
            </h1>
            <p className="mono">
              {truncate(ns.namespaceId, 32)}
              <CopyBtn value={ns.namespaceId} />
            </p>
          </div>
        </div>
        <div className="ns-header-actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              setPanel(panel === 'create-context' ? null : 'create-context')
            }
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            Create Context
          </button>
          <button
            className="btn"
            onClick={() =>
              setPanel(panel === 'create-subgroup' ? null : 'create-subgroup')
            }
          >
            <FolderPlusIcon style={{ width: 16, height: 16 }} />
            New Subgroup
          </button>
          <button
            className="btn"
            onClick={() => setPanel(panel === 'invite' ? null : 'invite')}
          >
            <LinkIcon style={{ width: 16, height: 16 }} />
            Invite
          </button>
          <button
            className="btn"
            onClick={() =>
              setPanel(panel === 'join-context' ? null : 'join-context')
            }
          >
            <ArrowRightOnRectangleIcon style={{ width: 16, height: 16 }} />
            Join Context
          </button>
          {showLeave ? (
            <ConfirmButton
              label="Leave"
              confirmLabel="Confirm leave"
              busyLabel="Leaving…"
              busy={busy}
              size="md"
              onConfirm={leave}
              icon={
                <ArrowRightStartOnRectangleIcon
                  style={{ width: 14, height: 14 }}
                />
              }
              title="Leave this namespace"
            />
          ) : (
            <ConfirmButton
              label="Delete"
              busyLabel="Deleting…"
              busy={busy}
              size="md"
              onConfirm={removeNamespace}
              icon={<TrashIcon style={{ width: 14, height: 14 }} />}
              title="Delete this namespace, its subgroups and contexts"
            />
          )}
        </div>
      </div>

      {panel === 'invite' && (
        <InvitePanel
          title="Invite to namespace"
          hint="Anyone with this code can join the namespace."
          showToast={showToast}
          onClose={() => setPanel(null)}
          onCreate={() => createNamespaceInvitation(ns.namespaceId)}
        />
      )}
      {panel === 'join-context' && (
        <JoinPanel
          title="Join a context"
          hint="Paste an invitation code for a context or subgroup in this namespace."
          confirmLabel="Join"
          showToast={showToast}
          onClose={() => setPanel(null)}
          onJoin={async (payload) => {
            await joinGroup(payload);
            showToast('Joined', 'success');
            setPanel(null);
            refreshTree();
          }}
        />
      )}
      {panel === 'create-context' && (
        <CreateContextPanel
          groupId={ns.namespaceId}
          defaultApplicationId={ns.targetApplicationId}
          installedApps={installedApps}
          showToast={showToast}
          onClose={() => setPanel(null)}
          onCreated={refreshTree}
        />
      )}
      {panel === 'create-subgroup' && (
        <CreateSubgroupPanel
          withVisibility
          showToast={showToast}
          onClose={() => setPanel(null)}
          onSubmit={async (name, visibility) => {
            const result = await createGroupInNamespace(ns.namespaceId, {
              ...(name ? { groupName: name } : {}),
              visibility,
            });
            showToast(
              `Subgroup created: ${truncate(result.groupId)}`,
              'success',
            );
            setPanel(null);
            refreshTree();
          }}
        />
      )}

      <div className="ns-stats-row">
        <div className="ns-stat-card">
          <div className="ns-stat-value">
            {self ? self.members.length : '…'}
          </div>
          <div className="ns-stat-label">Members</div>
        </div>
        <div
          className="ns-stat-card"
          title="Counted across the namespace and every subgroup"
        >
          <div className="ns-stat-value">
            {treeLoading && !tree ? '…' : contextCount}
          </div>
          <div className="ns-stat-label">Contexts</div>
        </div>
        <div className="ns-stat-card" title="Counted recursively">
          <div className="ns-stat-value">
            {treeLoading && !tree ? '…' : subgroupCount}
          </div>
          <div className="ns-stat-label">Subgroups</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value ns-stat-small">{ns.upgradePolicy}</div>
          <div className="ns-stat-label">Upgrade Policy</div>
        </div>
      </div>

      <div className="ns-section">
        <h2>Application</h2>
        <div className="ns-kv-row">
          <span className="ns-kv-label">Target application</span>
          <span className="ns-kv-value">
            {appName ? (
              <>
                {appName}
                <span className="mono ns-muted">
                  {truncate(ns.targetApplicationId)}
                </span>
              </>
            ) : (
              <span className="mono">
                {truncate(ns.targetApplicationId, 40)}
              </span>
            )}
            <CopyBtn value={ns.targetApplicationId} />
          </span>
        </div>
        {ns.appVersion && (
          <div className="ns-kv-row">
            <span className="ns-kv-label">Application version</span>
            <span className="ns-kv-value">{ns.appVersion}</span>
          </div>
        )}
      </div>

      {/* Not "your namespace identity" — there is no such thing. Every
          namespace on this node resolves to the same account, which is why
          core deleted the per-namespace route (#3522) in favour of a node-level
          one. The account is the id the members table is keyed by; the signing
          key never appears there, so both are labelled for what they are. */}
      {identity && (
        <div className="ns-section" data-testid="ns-identity-section">
          <h2>This node</h2>
          <div className="ns-kv-row">
            <span
              className="ns-kv-label"
              title="Node-level, not per-namespace. This is the id that appears as your row in the members table below."
            >
              Your account
            </span>
            <span className="ns-kv-value mono">
              {truncate(identity.accountId, 40)}
              <CopyBtn value={identity.accountId} />
            </span>
          </div>
          {identity.deviceId && (
            <div className="ns-kv-row">
              <span
                className="ns-kv-label"
                title="This installation. Several devices can share one account, and membership is recorded against the account, not this."
              >
                Device
              </span>
              <span className="ns-kv-value mono">
                {truncate(identity.deviceId, 40)}
                <CopyBtn value={identity.deviceId} />
              </span>
            </div>
          )}
          <div className="ns-kv-row">
            <span
              className="ns-kv-label"
              title="Base58, and the only base58 id on this page. It is what an operator adding you to a group types in — the add endpoint names a key, everything else names an account."
            >
              Signing key
            </span>
            <span className="ns-kv-value mono">
              {truncate(identity.publicKey, 40)}
              <CopyBtn value={identity.publicKey} />
            </span>
          </div>
        </div>
      )}

      <div className="ns-section">
        <div className="ns-section-header">
          <h2>Structure</h2>
          <div className="ns-section-actions">
            <span className="ns-muted">
              {contextCount} contexts · {subgroupCount} subgroups
            </span>
            <button
              className="btn btn-sm"
              onClick={refreshTree}
              disabled={treeLoading}
            >
              <ArrowPathIcon
                style={{ width: 14, height: 14 }}
                className={treeLoading ? 'spin' : ''}
              />
              Refresh
            </button>
          </div>
        </div>
        {partial && (
          <div className="alert alert-error">
            Some groups could not be loaded — the structure and counts below may
            be incomplete.
          </div>
        )}
        {treeLoading && !tree ? (
          <p className="ns-muted">Loading structure…</p>
        ) : !tree ||
          (tree.rootContexts.length === 0 && tree.subgroups.length === 0) ? (
          <p className="ns-muted">
            Empty namespace. Create a context or a subgroup to get started.
          </p>
        ) : (
          <StructureTree
            namespaceId={ns.namespaceId}
            namespaceName={namespaceLabel(ns, installedApps)}
            tree={tree}
            onOpenGroup={onOpenGroup}
            onDeleteGroup={async (groupId, name) => {
              try {
                await deleteGroup(groupId);
                showToast(`Subgroup "${name}" deleted`, 'success');
                refreshTree();
              } catch (e: unknown) {
                showToast(
                  errorMessage(e, 'Failed to delete subgroup'),
                  'error',
                );
              }
            }}
            onDeleteContext={async (contextId, name) => {
              try {
                await deleteContext(contextId);
                showToast(`Context "${name}" deleted`, 'success');
                refreshTree();
              } catch (e: unknown) {
                showToast(errorMessage(e, 'Failed to delete context'), 'error');
              }
            }}
            onRenameContext={async (parentGroupId, contextId, name) => {
              try {
                await setContextMetadata(parentGroupId, contextId, { name });
                showToast('Context renamed', 'success');
                refreshTree();
              } catch (e: unknown) {
                showToast(errorMessage(e, 'Failed to rename context'), 'error');
              }
            }}
          />
        )}
      </div>

      <MembersSection
        groupId={ns.namespaceId}
        showToast={showToast}
        onLoaded={setSelf}
      />
    </>
  );
}

// ── Subgroup detail ─────────────────────────────────────────────────────────

function GroupDetail({
  ns,
  groupId,
  installedApps,
  onBack,
  onGone,
  onOpenSubgroup,
  showToast,
}: {
  ns: Namespace;
  groupId: string;
  installedApps: InstalledApp[];
  onBack: () => void;
  onGone: () => void;
  onOpenSubgroup: (groupId: string) => void;
  showToast: ShowToast;
}) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [contexts, setContexts] = useState<GroupContextEntry[]>([]);
  const [subgroups, setSubgroups] = useState<SubgroupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [self, setSelf] = useState<GroupMembersResult | null>(null);
  const identity = useNodeIdentity();

  const load = useCallback(async () => {
    setLoading(true);
    const [infoRes, ctxRes, subRes] = await Promise.allSettled([
      getGroupInfo(groupId),
      listGroupContexts(groupId),
      listSubgroups(groupId),
    ]);
    if (infoRes.status === 'fulfilled') setInfo(infoRes.value);
    if (ctxRes.status === 'fulfilled') setContexts(ctxRes.value);
    if (subRes.status === 'fulfilled') setSubgroups(subRes.value);
    if (infoRes.status === 'rejected') {
      showToast(
        errorMessage(infoRes.reason, 'Failed to load the subgroup'),
        'error',
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const name = info?.metadata?.name ?? undefined;
  // Same as the namespace header: match our own ACCOUNT against the rows,
  // because rc.23 dropped `selfIdentity` from the member-list response.
  const myRole = identity
    ? self?.members.find((m) => m.identity === identity.accountId)?.role
    : undefined;
  const showLeave =
    myRole !== undefined && String(myRole).toLowerCase() !== 'admin';

  const visibility = (info?.subgroupVisibility ?? '').toLowerCase();

  const rename = async (next: string) => {
    setBusy(true);
    try {
      // Replace-semantics: send back the opaque `data` map we read, or the
      // app's own properties would be wiped by the rename.
      await setGroupMetadata(groupId, {
        name: next,
        data: info?.metadata?.data ?? {},
      });
      setInfo((prev) =>
        prev
          ? { ...prev, metadata: { ...(prev.metadata ?? {}), name: next } }
          : prev,
      );
      showToast('Subgroup renamed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to rename subgroup'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisibility = async () => {
    const next: SubgroupVisibility =
      visibility === 'open' ? 'restricted' : 'open';
    setBusy(true);
    try {
      await setSubgroupVisibility(groupId, next);
      setInfo((prev) => (prev ? { ...prev, subgroupVisibility: next } : prev));
      showToast(`Visibility set to ${next}`, 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to change visibility'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn ns-back-btn" onClick={onBack}>
            <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            Back
          </button>
          <div>
            <h1>
              {name || truncate(groupId, 20)}
              <RenameField
                value={name}
                placeholder="Subgroup name"
                busy={busy}
                onSave={rename}
              />
            </h1>
            <p className="mono">
              {truncate(groupId, 32)}
              <CopyBtn value={groupId} />
              <span className="ns-muted">
                {' '}
                in {namespaceLabel(ns, installedApps)}
              </span>
            </p>
          </div>
        </div>
        <div className="ns-header-actions">
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 14, height: 14 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              setPanel(panel === 'create-context' ? null : 'create-context')
            }
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            Create Context
          </button>
          <button
            className="btn"
            onClick={() =>
              setPanel(panel === 'create-subgroup' ? null : 'create-subgroup')
            }
          >
            <FolderPlusIcon style={{ width: 16, height: 16 }} />
            New Subgroup
          </button>
          <button
            className="btn"
            onClick={() => setPanel(panel === 'invite' ? null : 'invite')}
          >
            <LinkIcon style={{ width: 16, height: 16 }} />
            Invite
          </button>
          {showLeave ? (
            <ConfirmButton
              label="Leave"
              confirmLabel="Confirm leave"
              busyLabel="Leaving…"
              busy={busy}
              size="md"
              onConfirm={async () => {
                setBusy(true);
                try {
                  await leaveGroup(groupId);
                  showToast('Left subgroup', 'success');
                  onGone();
                } catch (e: unknown) {
                  showToast(
                    errorMessage(e, 'Failed to leave subgroup'),
                    'error',
                  );
                } finally {
                  setBusy(false);
                }
              }}
              icon={
                <ArrowRightStartOnRectangleIcon
                  style={{ width: 14, height: 14 }}
                />
              }
            />
          ) : (
            <ConfirmButton
              label="Delete"
              busyLabel="Deleting…"
              busy={busy}
              size="md"
              onConfirm={async () => {
                setBusy(true);
                try {
                  await deleteGroup(groupId);
                  showToast('Subgroup deleted', 'success');
                  onGone();
                } catch (e: unknown) {
                  showToast(
                    errorMessage(e, 'Failed to delete subgroup'),
                    'error',
                  );
                } finally {
                  setBusy(false);
                }
              }}
              icon={<TrashIcon style={{ width: 14, height: 14 }} />}
              title="Delete this subgroup, its contexts and nested subgroups"
            />
          )}
        </div>
      </div>

      {panel === 'invite' && (
        <InvitePanel
          title="Invite to subgroup"
          hint="Anyone with this code can join this subgroup."
          showToast={showToast}
          onClose={() => setPanel(null)}
          onCreate={() => createGroupInvitation(groupId)}
        />
      )}
      {panel === 'create-context' && (
        <CreateContextPanel
          groupId={groupId}
          defaultApplicationId={
            info?.targetApplicationId || ns.targetApplicationId
          }
          installedApps={installedApps}
          showToast={showToast}
          onClose={() => setPanel(null)}
          onCreated={load}
        />
      )}
      {panel === 'create-subgroup' && (
        <CreateSubgroupPanel
          withVisibility={false}
          showToast={showToast}
          onClose={() => setPanel(null)}
          onSubmit={async (subName) => {
            const result = await createSubgroup({
              parentGroupId: groupId,
              applicationId:
                info?.targetApplicationId || ns.targetApplicationId,
              upgradePolicy: info?.upgradePolicy || ns.upgradePolicy,
              ...(subName ? { name: subName } : {}),
            });
            showToast(
              `Subgroup created: ${truncate(result.groupId)}`,
              'success',
            );
            setPanel(null);
            await load();
          }}
        />
      )}

      <div className="ns-stats-row">
        <div className="ns-stat-card">
          <div className="ns-stat-value">
            {self ? self.members.length : info?.memberCount ?? '…'}
          </div>
          <div className="ns-stat-label">Members</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value">{contexts.length}</div>
          <div className="ns-stat-label">Contexts</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value">{subgroups.length}</div>
          <div className="ns-stat-label">Subgroups</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value ns-stat-small">
            {info?.subgroupVisibility || '—'}
          </div>
          <div className="ns-stat-label">
            Visibility
            <button
              className="ns-link-btn"
              onClick={toggleVisibility}
              disabled={busy || !info}
              title="Open = parent members can join automatically; Restricted = invite only"
            >
              change
            </button>
          </div>
        </div>
      </div>

      <div className="ns-section">
        <h2>Contexts ({contexts.length})</h2>
        {loading ? (
          <p className="ns-muted">Loading contexts…</p>
        ) : contexts.length === 0 ? (
          <p className="ns-muted">No contexts in this subgroup.</p>
        ) : (
          <div className="ns-group-list">
            {contexts.map((c) => (
              <div key={c.contextId} className="ns-group-row ns-group-row-flat">
                <CubeIcon className="ns-tree-icon" />
                <span className="ns-tree-label">
                  {c.name ? (
                    <>
                      <span className="ns-tree-name">{c.name}</span>
                      <span className="ns-tree-id mono">
                        {truncate(c.contextId)}
                      </span>
                    </>
                  ) : (
                    <span className="ns-tree-name mono">
                      {truncate(c.contextId)}
                    </span>
                  )}
                </span>
                <RenameField
                  value={c.name}
                  placeholder="Context name"
                  onSave={async (next) => {
                    try {
                      await setContextMetadata(groupId, c.contextId, {
                        name: next,
                      });
                      showToast('Context renamed', 'success');
                      await load();
                    } catch (e: unknown) {
                      showToast(
                        errorMessage(e, 'Failed to rename context'),
                        'error',
                      );
                    }
                  }}
                />
                <CopyBtn value={c.contextId} />
                <div className="ns-row-actions">
                  <ConfirmButton
                    label="Delete"
                    busyLabel="Deleting…"
                    onConfirm={async () => {
                      try {
                        await deleteContext(c.contextId);
                        showToast('Context deleted', 'success');
                        await load();
                      } catch (e: unknown) {
                        showToast(
                          errorMessage(e, 'Failed to delete context'),
                          'error',
                        );
                      }
                    }}
                    icon={<TrashIcon style={{ width: 13, height: 13 }} />}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ns-section">
        <h2>Subgroups ({subgroups.length})</h2>
        {loading ? (
          <p className="ns-muted">Loading subgroups…</p>
        ) : subgroups.length === 0 ? (
          <p className="ns-muted">No nested subgroups.</p>
        ) : (
          <div className="ns-group-list">
            {subgroups.map((g) => (
              <div key={g.groupId} className="ns-group-row ns-group-row-flat">
                <button
                  className="ns-tree-label ns-tree-link"
                  onClick={() => onOpenSubgroup(g.groupId)}
                >
                  {g.name ? (
                    <>
                      <span className="ns-tree-name">{g.name}</span>
                      <span className="ns-tree-id mono">
                        {truncate(g.groupId)}
                      </span>
                    </>
                  ) : (
                    <span className="ns-tree-name mono">
                      {truncate(g.groupId)}
                    </span>
                  )}
                </button>
                <CopyBtn value={g.groupId} />
                <div className="ns-row-actions">
                  <ConfirmButton
                    label="Delete"
                    busyLabel="Deleting…"
                    onConfirm={async () => {
                      try {
                        await deleteGroup(g.groupId);
                        showToast('Subgroup deleted', 'success');
                        await load();
                      } catch (e: unknown) {
                        showToast(
                          errorMessage(e, 'Failed to delete subgroup'),
                          'error',
                        );
                      }
                    }}
                    icon={<TrashIcon style={{ width: 13, height: 13 }} />}
                  />
                  <button
                    className="btn btn-sm"
                    onClick={() => onOpenSubgroup(g.groupId)}
                  >
                    Open
                    <ChevronRightIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MembersSection
        groupId={groupId}
        showToast={showToast}
        onLoaded={setSelf}
      />
    </>
  );
}
