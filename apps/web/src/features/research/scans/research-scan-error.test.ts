import { describe, expect, it } from 'vitest';
import { isResearchScanLimitError } from './research-scan-error';

function apiError(status: number, meta?: Record<string, unknown>) {
  return {
    response: {
      data: {
        errors: [{ code: 'research_scan_limit_reached', meta, status }],
      },
    },
  };
}

describe('isResearchScanLimitError', () => {
  it('recognises a refused scan by its status and next opening time', () => {
    expect(
      isResearchScanLimitError(
        apiError(429, { hasPlan: false, nextAvailableAtMs: 1_800_000_000_000 }),
      ),
    ).toBe(true);
  });

  it('does not take a rate limiter 429 for a scan limit', () => {
    expect(isResearchScanLimitError(apiError(429))).toBe(false);
  });

  it('does not take another failure for a scan limit', () => {
    expect(
      isResearchScanLimitError(
        apiError(500, { nextAvailableAtMs: 1_800_000_000_000 }),
      ),
    ).toBe(false);
    expect(isResearchScanLimitError(new Error('network'))).toBe(false);
  });
});
