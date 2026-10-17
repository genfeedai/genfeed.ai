import { sweepExpiryMs } from '@workers/scheduling/sweep-expiry.util';
import { describe, expect, it } from 'vitest';

describe('sweepExpiryMs', () => {
  it('floors a short cadence at ten minutes', () => {
    expect(sweepExpiryMs(60 * 1000)).toBe(10 * 60 * 1000);
  });

  it('allows a run to wait one full cycle of a longer cadence', () => {
    expect(sweepExpiryMs(60 * 60 * 1000)).toBe(60 * 60 * 1000);
  });
});
