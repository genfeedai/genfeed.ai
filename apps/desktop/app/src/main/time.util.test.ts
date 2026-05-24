import { describe, expect, it } from 'vitest';
import { toIso } from './time.util';

describe('toIso', () => {
  it('returns the current time as an ISO string', () => {
    const before = Date.now();
    const value = toIso();
    const after = Date.now();
    const parsed = Date.parse(value);

    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
