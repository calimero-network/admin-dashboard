/**
 * Outbound approvals: which of an app's declared URL prefixes a namespace lets
 * it send HTTPS requests under.
 *
 * Three parties have to agree before a request leaves a node: the operator
 * (node config), the publisher (the `outbound` list in the app's signed
 * manifest) and the namespace (an approval, per publisher). This file is the
 * namespace's side as the dashboard sees it — reading what the app declares,
 * turning a checklist into what the node expects, and classifying each prefix
 * of an approval for display. Pure, so it is unit-tested without a page.
 *
 * Core reference: `docs/.../build/guides/outbound.mdx` ("The namespace's side")
 * and `app_outbound` in `crates/context/src/outbound.rs`.
 */
import type { OutboundApproval, OutboundSelection } from '../api/namespaceApi';

/**
 * The URL prefixes an installed app declares, from its decoded metadata JSON.
 *
 * Core writes the manifest's `outbound` into the application's metadata as a
 * top-level array of strings (`BundleManifest::to_metadata_json`, only when
 * non-empty) and the node reads it back from there (`app_outbound`). Anything
 * that is not a string is skipped, the same as the node does, and duplicates
 * collapse so a checklist never shows one prefix twice.
 */
export function declaredOutbound(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { outbound?: unknown }).outbound;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * What to send as `approveOutbound` for a checklist over `declared`.
 *
 *  • the app declares nothing → `undefined`: leave the field out; there is
 *    nothing to approve and an older node would reject the unknown key.
 *  • every declared prefix checked → `"manifest"`.
 *  • otherwise → the checked prefixes, in declared order. An empty list is
 *    meaningful: every declared prefix still becomes reviewed, so the app's
 *    requests answer `NotApproved` (an admin said no) rather than
 *    `AwaitingApproval` (nobody was asked).
 */
export function outboundSelection(
  declared: string[],
  checked: ReadonlySet<string>,
): OutboundSelection | undefined {
  if (declared.length === 0) return undefined;
  const picked = declared.filter((p) => checked.has(p));
  return picked.length === declared.length ? 'manifest' : picked;
}

export type OutboundStatus = 'approved' | 'revoked' | 'awaiting';

export interface OutboundRow {
  prefix: string;
  /**
   *  • `approved` — in `prefixes`; requests under it go out.
   *  • `revoked` — reviewed but not approved: left out at install/upgrade, or
   *    revoked since. Requests answer `NotApproved`.
   *  • `awaiting` — the installed app declares it and no approver has seen it.
   *    Requests answer `AwaitingApproval`.
   */
  status: OutboundStatus;
}

/**
 * One publisher's prefixes, classified. `declared` is what the installed app of
 * that publisher declares (pass `[]` when unknown); only it can produce
 * `awaiting` rows. Approved first, then awaiting, then revoked, each in the
 * order the node listed them.
 */
export function outboundRows(
  approval: Pick<OutboundApproval, 'prefixes' | 'reviewed'> | undefined,
  declared: string[] = [],
): OutboundRow[] {
  const prefixes = approval?.prefixes ?? [];
  const reviewed = approval?.reviewed ?? [];
  const rows: OutboundRow[] = [];
  const seen = new Set<string>();
  const push = (prefix: string, status: OutboundStatus) => {
    if (seen.has(prefix)) return;
    seen.add(prefix);
    rows.push({ prefix, status });
  };
  for (const p of prefixes) push(p, 'approved');
  for (const p of declared) if (!reviewed.includes(p)) push(p, 'awaiting');
  for (const p of reviewed) push(p, 'revoked');
  return rows;
}

/**
 * The full list to PUT after revoking `prefix`. The PUT replaces, so this is
 * every approved prefix but that one — `[]` when it was the last.
 */
export function withoutPrefix(prefixes: string[], prefix: string): string[] {
  return prefixes.filter((p) => p !== prefix);
}

/** The full list to PUT after (re-)approving `prefix`. */
export function withPrefix(prefixes: string[], prefix: string): string[] {
  return prefixes.includes(prefix) ? prefixes : [...prefixes, prefix];
}
