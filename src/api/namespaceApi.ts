import {
  getAppEndpointKey,
  getAccessToken,
} from '@calimero-network/calimero-client';

// ---- Types ----

export interface Namespace {
  namespaceId: string;
  appKey: string;
  targetApplicationId: string;
  upgradePolicy: string;
  createdAt: number;
  alias?: string;
  memberCount: number;
  contextCount: number;
  subgroupCount: number;
}

export interface NamespaceIdentity {
  namespaceId: string;
  publicKey: string;
}

export interface SubgroupEntry {
  groupId: string;
  alias?: string;
}

export interface GroupInfo {
  groupId: string;
  appKey: string;
  targetApplicationId: string;
  upgradePolicy: string;
  memberCount: number;
  contextCount: number;
  defaultCapabilities: number;
  defaultVisibility: string;
  alias?: string;
}

export interface GroupMember {
  identity: string;
  role: string;
  alias?: string;
}

export interface GroupContextEntry {
  contextId: string;
  alias?: string;
}

export interface CreateNamespaceRequest {
  applicationId: string;
  upgradePolicy: string;
  alias?: string;
}

export interface CreateGroupInNamespaceRequest {
  groupAlias?: string;
}

export interface CreateContextRequest {
  applicationId: string;
  groupId: string;
  alias?: string;
  initializationParams: number[];
  identitySecret?: string;
}

export interface CreateContextResponseData {
  contextId: string;
  memberPublicKey: string;
  groupId?: string;
  groupCreated?: boolean;
}

export interface AddMembersRequest {
  members: Array<{ identity: string; role: string }>;
}

export interface RemoveMembersRequest {
  members: string[];
}

// ---- HTTP helpers ----

function baseUrl(): string {
  return getAppEndpointKey() ?? '';
}

function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const json = await res.json();
  // Node returns { data: T } for most endpoints
  return (json?.data ?? json) as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

// ---- Namespace API ----

export async function listNamespaces(): Promise<Namespace[]> {
  return apiGet<Namespace[]>('/admin-api/namespaces');
}

export async function getNamespace(namespaceId: string): Promise<Namespace> {
  return apiGet<Namespace>(`/admin-api/namespaces/${namespaceId}`);
}

export async function getNamespaceIdentity(
  namespaceId: string,
): Promise<NamespaceIdentity> {
  return apiGet<NamespaceIdentity>(
    `/admin-api/namespaces/${namespaceId}/identity`,
  );
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
  req?: { expirationTimestamp?: number; recursive?: boolean },
): Promise<unknown> {
  return apiPost<unknown>(
    `/admin-api/namespaces/${namespaceId}/invite`,
    req ?? {},
  );
}

export async function joinNamespace(
  namespaceId: string,
  req: { invitation: unknown; groupAlias?: string },
): Promise<{ groupId: string; memberIdentity: string }> {
  return apiPost<{ groupId: string; memberIdentity: string }>(
    `/admin-api/namespaces/${namespaceId}/join`,
    req,
  );
}

export async function createGroupInNamespace(
  namespaceId: string,
  req?: CreateGroupInNamespaceRequest,
): Promise<{ groupId: string }> {
  return apiPost<{ groupId: string }>(
    `/admin-api/namespaces/${namespaceId}/groups`,
    { groupAlias: req?.groupAlias },
  );
}

export async function listNamespaceGroups(
  namespaceId: string,
): Promise<SubgroupEntry[]> {
  return apiGet<SubgroupEntry[]>(`/admin-api/namespaces/${namespaceId}/groups`);
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

export async function listGroupMembers(
  groupId: string,
): Promise<GroupMember[]> {
  const result = await apiGet<GroupMember[] | { data: GroupMember[] }>(
    `/admin-api/groups/${groupId}/members`,
  );
  // Handle both shapes: { data: [...] } or directly [...]
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'data' in result)
    return (result as { data: GroupMember[] }).data;
  return [];
}

export async function listGroupContexts(
  groupId: string,
): Promise<GroupContextEntry[]> {
  return apiGet<GroupContextEntry[]>(`/admin-api/groups/${groupId}/contexts`);
}

export async function listSubgroups(groupId: string): Promise<SubgroupEntry[]> {
  return apiGet<SubgroupEntry[]>(`/admin-api/groups/${groupId}/subgroups`);
}

export async function addGroupMembers(
  groupId: string,
  req: AddMembersRequest,
): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/members`, req);
}

export async function removeGroupMembers(
  groupId: string,
  req: RemoveMembersRequest,
): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/members/remove`, req);
}

export async function updateMemberRole(
  groupId: string,
  identity: string,
  role: string,
): Promise<void> {
  await apiPut<void>(`/admin-api/groups/${groupId}/members/${identity}/role`, {
    role,
  });
}

export async function createGroupInvitation(groupId: string): Promise<unknown> {
  return apiPost<unknown>(`/admin-api/groups/${groupId}/invite`, {});
}

export async function joinGroup(req: {
  invitation: unknown;
  groupAlias?: string;
}): Promise<{ groupId: string; memberIdentity: string }> {
  return apiPost<{ groupId: string; memberIdentity: string }>(
    '/admin-api/groups/join',
    req,
  );
}

export async function setSubgroupVisibility(
  groupId: string,
  visibility: 'open' | 'restricted',
): Promise<void> {
  await apiPut<void>(
    `/admin-api/groups/${groupId}/settings/subgroup-visibility`,
    { subgroupVisibility: visibility },
  );
}

export async function createContext(
  req: CreateContextRequest,
): Promise<CreateContextResponseData> {
  return apiPost<CreateContextResponseData>('/admin-api/contexts', req);
}

// ---- Template stubs (endpoints not yet live on node) ----

/** Leave a namespace you are a member of. */
export async function leaveNamespace(namespaceId: string): Promise<void> {
  await apiPost<void>(`/admin-api/namespaces/${namespaceId}/leave`);
}

/** Leave a group you are a member of. */
export async function leaveGroup(groupId: string): Promise<void> {
  await apiPost<void>(`/admin-api/groups/${groupId}/leave`);
}

/** Leave a context you are a member of. */
export async function leaveContext(contextId: string): Promise<void> {
  await apiPost<void>(`/admin-api/contexts/${contextId}/leave`);
}
