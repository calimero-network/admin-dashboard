import {
  getAppEndpointKey,
  getAccessToken,
} from '@calimero-network/calimero-client';

/**
 * Thin typed wrapper over merod's `/admin-api` namespace + group surface.
 *
 * Field names here are the WIRE names, taken from core's
 * `crates/server/primitives/src/admin/mod.rs` (every type there is
 * `#[serde(rename_all = "camelCase")]`). Two traps this file exists to
 * encode:
 *
 *  • The display name of a namespace / group / member / context is `name`
 *    everywhere on the wire. It was called "alias" in an older revision of
 *    the API and nowhere else since — reading `alias` yields `undefined`,
 *    which is why names silently never rendered.
 *  • Response envelopes are NOT uniform. Most endpoints answer `{ data: T }`,
 *    but `listGroupMembers` answers `{ members }` and `listSubgroups` answers
 *    `{ subgroups }` — unwrapping `.data` on those gives `undefined`, and a
 *    naive `Array.isArray` guard then renders an empty list instead of failing
 *    loudly.
 *  • A member is named by TWO different ids depending on the verb, and they
 *    are deliberately rendered in different alphabets so a mix-up fails loudly
 *    instead of resolving to the wrong principal. Since core 0.11.0-rc.23 the
 *    listing, remove, role, capabilities and metadata calls all name a member
 *    by ACCOUNT (`AccountId`, 64 hex characters); only add-member still names
 *    a KEY (`PublicKey`, base58). Each affected function says which it wants.
 */

// ---- Types ----

/** `calimero_primitives::metadata::MetadataRecord`. */
export interface MetadataRecord {
  /** Display name. `null`/absent means no name has been set. */
  name?: string | null;
  /** Opaque app-defined properties, stored verbatim by core. */
  data?: Record<string, string>;
  updatedAt?: number;
  updatedBy?: string;
}

export interface Namespace {
  namespaceId: string;
  appKey: string;
  targetApplicationId: string;
  upgradePolicy: string;
  createdAt: number;
  name?: string;
  memberCount: number;
  contextCount: number;
  subgroupCount: number;
  /** Bundle-manifest version of this namespace's pinned blob, when resolvable. */
  appVersion?: string;
}

/**
 * Who this NODE is — `GET /admin-api/identity`, no namespace involved.
 *
 * There used to be a `GET /admin-api/namespaces/:id/identity`, and 1.13.0 of
 * this dashboard called it. core 0.11.0-rc.23 deleted it (#3522) because it was
 * a lie with an extra path segment: it took a namespace and answered with the
 * node's account regardless of which one you passed. Every namespace on a node
 * resolves to the same account, so there was never a per-namespace identity to
 * report — asking a namespace who you are only ever made the answer look like
 * it varied by scope.
 */
export interface NodeIdentity {
  /** The account this node writes as. 64 HEX characters — this is the id the
   *  member listing returns and every member-addressing endpoint expects. */
  accountId: string;
  /** Hex `DeviceId`, absent on a node that has not enrolled into an account. */
  deviceId?: string;
  /** The key this node signs ops with, base58 — the DEVICE key, not the
   *  account root. Never appears in a member listing. */
  publicKey: string;
  /** Hex epoch-0 root public key; what a second device pairs against. */
  accountRootPublicKey?: string;
}

export interface SubgroupEntry {
  groupId: string;
  name?: string;
}

export interface GroupInfo {
  groupId: string;
  appKey: string;
  targetApplicationId: string;
  upgradePolicy: string;
  memberCount: number;
  contextCount: number;
  defaultCapabilities: number;
  /** `"open"` | `"restricted"` — NOT `defaultVisibility`. */
  subgroupVisibility: string;
  metadata?: MetadataRecord | null;
  groupStateHash?: string;
}

/** `Coordinated` was removed from core; offering it yields a 400. */
export type UpgradePolicy = 'Automatic' | 'LazyOnAccess';

/**
 * `ReadOnlyTee` is deliberately absent: core rejects it on both the add-member
 * and update-role paths (it is only ever granted via TEE attestation).
 */
export type GroupRole = 'Admin' | 'Member' | 'ReadOnly';

export interface GroupMember {
  /**
   * The member's ACCOUNT — 64 hex characters, not the base58 a key renders as.
   * A member is a person here, and a person may hold several keys, so the
   * membership row is keyed by the account rather than by any one device key.
   */
  identity: string;
  role: GroupRole | string;
  name?: string;
}

/**
 * `{ members }` and nothing else.
 *
 * rc.23 removed `selfIdentity` from this response. It never belonged: it
 * answered "who am I", which is a node-level question the member list of one
 * group is a strange place to ask. Callers that need it read
 * {@link getNodeIdentity} and compare `accountId` against `member.identity`.
 */
export interface GroupMembersResult {
  members: GroupMember[];
}

export interface GroupContextEntry {
  contextId: string;
  name?: string;
}

export type SubgroupVisibility = 'open' | 'restricted';

export interface CreateNamespaceRequest {
  applicationId: string;
  upgradePolicy: UpgradePolicy;
  name?: string;
}

export interface CreateContextRequest {
  applicationId: string;
  groupId: string;
  name?: string;
  serviceName?: string;
  initializationParams: number[];
  identitySecret?: string;
}

export interface CreateContextResponseData {
  contextId: string;
  memberPublicKey: string;
  groupId?: string;
  groupCreated?: boolean;
}

/**
 * The one member-addressing call that still takes a KEY.
 *
 * `identity` here is a base58 `PublicKey`, not the 64-hex account the listing
 * hands back. That asymmetry is deliberate on core's side: an add is the only
 * call whose subject may have no account on this node yet — the account is a
 * hash of a genesis the node learns only once the person has joined — so an
 * operator can only name them by the key they sign with. The apply resolves
 * that key to the account the row is keyed by, and the listing is where the
 * caller reads the account back.
 *
 * Pasting an id copied out of the members table here therefore addresses
 * nobody. {@link looksLikeAccountId} exists so the UI can say so.
 */
export interface AddMembersRequest {
  members: Array<{ identity: string; role: GroupRole }>;
}

/** Members named by ACCOUNT (64 hex) — the principal the rows are keyed by. */
export interface RemoveMembersRequest {
  members: string[];
}

/**
 * True for a 64-hex `AccountId`, false for the base58 a `PublicKey` renders as.
 *
 * Base58 has no `0`, so a 64-character all-hex string is an account with
 * near-certainty; this is a UI hint, not validation — the node is the authority
 * and rejects a mismatch itself.
 */
export function looksLikeAccountId(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

/** `{ invitation, groupName? }` — the unwrapped body of an invite response. */
export interface InvitationPayload {
  invitation: Record<string, unknown>;
  groupName?: string;
}

/**
 * What a join answers. Note the TWO ids, and which one is useful afterwards.
 *
 * `memberIdentity` is the base58 key the joiner signs with; `memberAccount`
 * (added in rc.23) is the 64-hex account that key joined as, and it is the id
 * every member-addressing endpoint expects. Anything that wants to look the new
 * member up, change their role or remove them must use `memberAccount` —
 * `memberIdentity` matches no row in the listing.
 */
export interface JoinResult {
  groupId: string;
  memberIdentity: string;
  memberAccount: string;
  /** Still present at rc.23; core#3528 to drop it is a draft. */
  governanceOp?: string;
}

// ---- HTTP helpers ----

function baseUrl(): string {
  return getAppEndpointKey() ?? '';
}

function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Pull a human message out of a node error body instead of surfacing the raw
 * JSON. merod answers `{"error": "..."}` on most failures.
 */
function describeError(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return String(status);
  try {
    const parsed = JSON.parse(trimmed);
    const human = parsed?.error ?? parsed?.message ?? parsed?.detail;
    if (human) return `${status}: ${String(human)}`;
  } catch {
    // not JSON — fall through
  }
  return `${status}: ${trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed}`;
}

async function readBody<T>(res: Response, raw: boolean): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(describeError(res.status, text));
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  const json = JSON.parse(text);
  // `raw` opts out of the `{ data: … }` unwrap for the endpoints that answer
  // a bare object (list members / list subgroups).
  return (raw ? json : json?.data ?? json) as T;
}

async function apiGet<T>(path: string, raw = false): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { ...authHeader() },
  });
  return readBody<T>(res, raw);
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body ?? {}),
  });
  return readBody<T>(res, false);
}

/**
 * DELETE with an explicit empty JSON body.
 *
 * The node's delete handlers deserialize a JSON body even when they need no
 * fields from it, so a bodyless DELETE is rejected outright:
 *
 *   400 {"error":"JSON syntax error: Failed to parse the request body as JSON:
 *        EOF while parsing a value at line 1 column 0"}
 *
 * Sending `{}` (with the matching Content-Type) satisfies the extractor. Caught
 * by e2e-live/namespaces.live.spec.ts — every delete on the Namespaces page
 * silently failed against a real node before this.
 */
async function apiDelete<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  });
  return readBody<T>(res, false);
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body ?? {}),
  });
  return readBody<T>(res, false);
}

// ---- Namespace API ----

export async function listNamespaces(): Promise<Namespace[]> {
  const result = await apiGet<Namespace[]>('/admin-api/namespaces');
  return Array.isArray(result) ? result : [];
}

export async function getNamespace(namespaceId: string): Promise<Namespace> {
  return apiGet<Namespace>(`/admin-api/namespaces/${namespaceId}`);
}

/**
 * Who this node is. Takes no namespace, and that is the whole point of it.
 *
 * Rejects with 404 on a node that has taken part in nothing yet — it holds
 * neither a device nor an account root, so there is no account to report rather
 * than an empty one. Callers treat that as "unknown", not as an error.
 */
export async function getNodeIdentity(): Promise<NodeIdentity> {
  return apiGet<NodeIdentity>('/admin-api/identity');
}

export async function createNamespace(
  req: CreateNamespaceRequest,
): Promise<{ namespaceId: string }> {
  return apiPost<{ namespaceId: string }>('/admin-api/namespaces', req);
}

export async function deleteNamespace(
  namespaceId: string,
): Promise<{ isDeleted: boolean }> {
  return apiDelete<{ isDeleted: boolean }>(
    `/admin-api/namespaces/${namespaceId}`,
  );
}

export async function createNamespaceInvitation(
  namespaceId: string,
): Promise<InvitationPayload> {
  return apiPost<InvitationPayload>(
    `/admin-api/namespaces/${namespaceId}/invite`,
    {},
  );
}

export async function joinNamespace(
  namespaceId: string,
  req: InvitationPayload,
): Promise<JoinResult> {
  return apiPost<JoinResult>(`/admin-api/namespaces/${namespaceId}/join`, req);
}

/** Remove your own identity from the namespace (cascades to its subgroups). */
export async function leaveNamespace(namespaceId: string): Promise<void> {
  await apiPost<void>(`/admin-api/namespaces/${namespaceId}/leave`);
}

export async function listNamespaceGroups(
  namespaceId: string,
): Promise<SubgroupEntry[]> {
  const result = await apiGet<SubgroupEntry[]>(
    `/admin-api/namespaces/${namespaceId}/groups`,
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Create a subgroup directly under a namespace, through the namespace
 * governance path.
 *
 * The name key on the wire is `groupName` (core:
 * `CreateGroupInNamespaceBody`). mero-js sends `name` here, which serde
 * silently drops — that is the long-standing "subgroup names don't persist"
 * bug. We send BOTH spellings: unknown fields are ignored by serde, so this
 * is correct against either revision of the node.
 */
export async function createGroupInNamespace(
  namespaceId: string,
  req?: { groupName?: string; visibility?: SubgroupVisibility },
): Promise<{ groupId: string }> {
  return apiPost<{ groupId: string }>(
    `/admin-api/namespaces/${namespaceId}/groups`,
    {
      ...(req?.groupName
        ? { groupName: req.groupName, name: req.groupName }
        : {}),
      ...(req?.visibility ? { visibility: req.visibility } : {}),
    },
  );
}

// ---- Group API ----

export async function getGroupInfo(groupId: string): Promise<GroupInfo> {
  return apiGet<GroupInfo>(`/admin-api/groups/${groupId}`);
}

export async function deleteGroup(
  groupId: string,
): Promise<{ isDeleted: boolean }> {
  return apiDelete<{ isDeleted: boolean }>(`/admin-api/groups/${groupId}`);
}

/** Remove your own identity from a subgroup. */
export async function leaveGroup(groupId: string): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/leave`);
}

/**
 * Create a nested subgroup under another group.
 *
 * The namespace-scoped endpoint only creates direct children of the root, so
 * anything deeper goes through `POST /groups` with an explicit
 * `parentGroupId`. `applicationId` + `upgradePolicy` are required there and
 * are inherited from the namespace by the caller.
 */
export async function createSubgroup(req: {
  parentGroupId: string;
  applicationId: string;
  upgradePolicy: string;
  name?: string;
}): Promise<{ groupId: string }> {
  return apiPost<{ groupId: string }>('/admin-api/groups', {
    parentGroupId: req.parentGroupId,
    applicationId: req.applicationId,
    upgradePolicy: req.upgradePolicy,
    ...(req.name ? { name: req.name } : {}),
  });
}

/**
 * `{ members }` — NOT `{ data: [...] }`, and no longer `{ members,
 * selfIdentity }`: rc.23 dropped the self field. Each `identity` is an ACCOUNT.
 */
export async function listGroupMembers(
  groupId: string,
): Promise<GroupMembersResult> {
  const result = await apiGet<GroupMembersResult>(
    `/admin-api/groups/${groupId}/members`,
    true,
  );
  return { members: Array.isArray(result?.members) ? result.members : [] };
}

export async function listGroupContexts(
  groupId: string,
): Promise<GroupContextEntry[]> {
  const result = await apiGet<GroupContextEntry[]>(
    `/admin-api/groups/${groupId}/contexts`,
  );
  return Array.isArray(result) ? result : [];
}

/** `{ subgroups: [...] }` — NOT `{ data: [...] }`. */
export async function listSubgroups(groupId: string): Promise<SubgroupEntry[]> {
  const result = await apiGet<{ subgroups?: SubgroupEntry[] }>(
    `/admin-api/groups/${groupId}/subgroups`,
    true,
  );
  return Array.isArray(result?.subgroups) ? result.subgroups : [];
}

/** Members named by KEY (base58) — the only such call. See {@link AddMembersRequest}. */
export async function addGroupMembers(
  groupId: string,
  req: AddMembersRequest,
): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/members`, req);
}

/** Members named by ACCOUNT (64 hex), exactly as `listGroupMembers` returns them. */
export async function removeGroupMembers(
  groupId: string,
  req: RemoveMembersRequest,
): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/members/remove`, req);
}

/** `account` is the 64-hex `AccountId`; core's path segment is literally `:account`. */
export async function updateMemberRole(
  groupId: string,
  account: string,
  role: GroupRole,
): Promise<void> {
  await apiPut<void>(`/admin-api/groups/${groupId}/members/${account}/role`, {
    role,
  });
}

export async function createGroupInvitation(
  groupId: string,
): Promise<InvitationPayload> {
  return apiPost<InvitationPayload>(`/admin-api/groups/${groupId}/invite`, {});
}

export async function joinGroup(req: InvitationPayload): Promise<JoinResult> {
  return apiPost<JoinResult>('/admin-api/groups/join', req);
}

export async function setSubgroupVisibility(
  groupId: string,
  visibility: SubgroupVisibility,
): Promise<void> {
  await apiPut<void>(
    `/admin-api/groups/${groupId}/settings/subgroup-visibility`,
    { subgroupVisibility: visibility },
  );
}

// ---- Metadata (the "name" of a group / member / context) ----

/**
 * Core replaces the whole record, so an omitted `data` map wipes any opaque
 * properties an app had stored. Callers pass the record they just read back.
 */
export async function setGroupMetadata(
  groupId: string,
  req: { name?: string; data?: Record<string, string> },
): Promise<void> {
  await apiPut<void>(`/admin-api/groups/${groupId}/metadata`, {
    ...(req.name !== undefined ? { name: req.name } : {}),
    data: req.data ?? {},
  });
}

export async function getGroupMetadata(
  groupId: string,
): Promise<MetadataRecord | null> {
  return apiGet<MetadataRecord | null>(`/admin-api/groups/${groupId}/metadata`);
}

/** `account` is the 64-hex `AccountId`, not the key the member signs with. */
export async function setMemberMetadata(
  groupId: string,
  account: string,
  req: { name?: string; data?: Record<string, string> },
): Promise<void> {
  await apiPut<void>(
    `/admin-api/groups/${groupId}/members/${account}/metadata`,
    {
      ...(req.name !== undefined ? { name: req.name } : {}),
      data: req.data ?? {},
    },
  );
}

export async function setContextMetadata(
  groupId: string,
  contextId: string,
  req: { name?: string; data?: Record<string, string> },
): Promise<void> {
  await apiPut<void>(
    `/admin-api/groups/${groupId}/contexts/${contextId}/metadata`,
    {
      ...(req.name !== undefined ? { name: req.name } : {}),
      data: req.data ?? {},
    },
  );
}

// ---- Context API ----

export async function createContext(
  req: CreateContextRequest,
): Promise<CreateContextResponseData> {
  return apiPost<CreateContextResponseData>('/admin-api/contexts', req);
}

export async function deleteContext(
  contextId: string,
): Promise<{ isDeleted: boolean }> {
  return apiDelete<{ isDeleted: boolean }>(`/admin-api/contexts/${contextId}`);
}

/** Leave a context you are a member of. */
export async function leaveContext(contextId: string): Promise<void> {
  await apiPost<void>(`/admin-api/contexts/${contextId}/leave`);
}
