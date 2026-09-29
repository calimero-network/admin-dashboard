/**
 * How a group member's role reads in the UI.
 *
 * Ported from the desktop's `utils/groupRoles.ts` (tauri-app#319), so a member
 * list shows the same words in both.
 */

/**
 * The roles core only ever grants through TEE attestation, for cloud HA fleet
 * nodes. The role endpoint refuses them, so the UI shows them read-only rather
 * than as a role <select> that could only fail.
 */
const TEE_ROLES = ['RelayTee', 'ReadOnlyTee'] as const;

export function isTeeRole(role: string | undefined | null): boolean {
  return (TEE_ROLES as readonly string[]).includes(role ?? '');
}

/**
 * Attestation admission mints the two TEE roles: a relay also relays members'
 * writes, a replica does not. Any other role reads as core names it.
 */
export function roleLabel(role: string): string {
  switch (role) {
    case 'RelayTee':
      return 'TEE relay';
    case 'ReadOnlyTee':
      return 'TEE replica';
    default:
      return role;
  }
}
