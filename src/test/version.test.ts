import { describe, it, expect } from 'vitest';
import { formatBuild } from '../utils/version';

describe('formatBuild', () => {
  it('leaves a tagged release untouched', () => {
    expect(formatBuild('v1.12.4')).toBe('v1.12.4');
  });

  it('condenses commits-since-tag into tag+sha', () => {
    // The raw describe is too long for the 56px header.
    expect(formatBuild('v1.12.4-2-gcdd9ed0')).toBe('v1.12.4+cdd9ed0');
    expect(formatBuild('v1.12.4-137-gabc1234')).toBe('v1.12.4+abc1234');
  });

  it('marks a dirty tree with an asterisk', () => {
    expect(formatBuild('v1.12.4-dirty')).toBe('v1.12.4*');
    expect(formatBuild('v1.12.4-2-gcdd9ed0-dirty')).toBe('v1.12.4+cdd9ed0*');
  });

  it('passes through a bare sha (no tags in the clone)', () => {
    expect(formatBuild('cdd9ed0')).toBe('cdd9ed0');
  });

  it('passes through the no-git fallback', () => {
    expect(formatBuild('dev')).toBe('dev');
  });
});
