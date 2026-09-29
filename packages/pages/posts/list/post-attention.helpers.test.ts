import { describe, expect, it } from 'vitest';
import { needsPostAttention } from './post-attention.helpers';

describe('publishing attention window', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  it('includes both boundaries but excludes overdue, later and malformed schedules', () => {
    expect(needsPostAttention('scheduled', new Date(now), now)).toBe(true);
    expect(needsPostAttention('scheduled', new Date(now + 86400000), now)).toBe(
      true,
    );
    expect(needsPostAttention('scheduled', new Date(now - 1), now)).toBe(false);
    expect(needsPostAttention('scheduled', new Date(now + 86400001), now)).toBe(
      false,
    );
    expect(needsPostAttention('scheduled', 'invalid', now)).toBe(false);
    expect(needsPostAttention('draft', new Date(now), now)).toBe(false);
  });
});
