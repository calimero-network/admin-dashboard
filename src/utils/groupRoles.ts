const TEE_ROLES = ['RelayTee', 'ReadOnlyTee'] as const;

export function isTeeRole(role: string | undefined | null): boolean {
  return (TEE_ROLES as readonly string[]).includes(role ?? '');
}

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
