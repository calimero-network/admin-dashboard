import bs58 from 'bs58';
import type { InvitationPayload } from '../api/namespaceApi';

/**
 * Invitation codes, wire-compatible with the desktop app.
 *
 * The desktop app (tauri-app `Namespaces.tsx`) ships an invitation as
 * `btoa(JSON.stringify(payload))` and joins with
 * `JSON.parse(atob(code))` — so base64 is the interchange format, and a code
 * generated here can be pasted into the desktop app and vice versa. The
 * dashboard used to emit base58, which nothing else could read; `decode`
 * still accepts it (and raw JSON) so codes already handed out keep working.
 *
 * The payload itself is the unwrapped body of an invite response:
 * `{ invitation: SignedGroupOpenInvitation, groupName? }` — exactly what the
 * join endpoints take as their request body.
 */

function toBinaryString(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function fromBinaryString(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

export function encodeInvitation(payload: InvitationPayload): string {
  const json = JSON.stringify(payload);
  return btoa(toBinaryString(new TextEncoder().encode(json)));
}

function parseJson(text: string): InvitationPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object')
      return parsed as InvitationPayload;
  } catch {
    // not JSON
  }
  return null;
}

/** Accepts base64 (canonical), base58 (legacy), or raw JSON. */
export function decodeInvitation(input: string): InvitationPayload {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Invitation code is empty');

  const direct = parseJson(trimmed);
  if (direct) return normalize(direct);

  try {
    const decoded = new TextDecoder().decode(fromBinaryString(atob(trimmed)));
    const parsed = parseJson(decoded);
    if (parsed) return normalize(parsed);
  } catch {
    // not base64
  }

  try {
    const decoded = new TextDecoder().decode(bs58.decode(trimmed));
    const parsed = parseJson(decoded);
    if (parsed) return normalize(parsed);
  } catch {
    // not base58
  }

  throw new Error('Could not read that invitation code');
}

/**
 * Older dashboard builds encoded the raw `SignedGroupOpenInvitation` instead
 * of the `{ invitation }` envelope. Wrap the bare form rather than rejecting
 * it.
 *
 * Both shapes have a top-level `invitation` key, so its presence proves
 * nothing. The discriminator is `inviter_signature`: it sits BESIDE
 * `invitation` on a signed invitation, and one level deeper in the envelope.
 */
function normalize(parsed: InvitationPayload): InvitationPayload {
  const record = parsed as unknown as Record<string, unknown>;
  if (record['inviter_signature'] !== undefined) {
    return { invitation: record };
  }
  if (parsed.invitation) return parsed;
  return { invitation: record };
}

/**
 * The namespace a code lets you join, read out of the signed invitation
 * itself — a joiner has no other way to know the id, and the join endpoint is
 * addressed by it.
 *
 * `group_id` is a 32-byte array on the wire (`ContextGroupId`), and the
 * route wants it hex-encoded.
 */
export function namespaceIdFromInvitation(payload: InvitationPayload): string {
  const inner = (payload.invitation as Record<string, unknown> | undefined)?.[
    'invitation'
  ] as Record<string, unknown> | undefined;
  const groupId = inner?.['group_id'] ?? inner?.['groupId'];
  if (!Array.isArray(groupId) || groupId.length === 0) {
    throw new Error('Invitation is missing its group id');
  }
  return groupId
    .map((byte) => Number(byte).toString(16).padStart(2, '0'))
    .join('');
}
