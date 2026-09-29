import { describe, expect, it } from 'vitest';
import { isTeeRole, roleLabel } from '../utils/groupRoles';

describe('roleLabel', () => {
  it('tells a TEE relay from a TEE replica', () => {
    expect(roleLabel('RelayTee')).toBe('TEE relay');
    expect(roleLabel('ReadOnlyTee')).toBe('TEE replica');
  });

  it('shows every other role as core names it', () => {
    for (const role of ['Admin', 'Member', 'ReadOnly']) {
      expect(roleLabel(role)).toBe(role);
    }
  });
});

describe('isTeeRole', () => {
  it('is true only for the attestation-granted roles', () => {
    expect(isTeeRole('RelayTee')).toBe(true);
    expect(isTeeRole('ReadOnlyTee')).toBe(true);
    for (const role of ['Admin', 'Member', 'ReadOnly', '', undefined, null]) {
      expect(isTeeRole(role)).toBe(false);
    }
  });
});
