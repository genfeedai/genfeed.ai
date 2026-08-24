import { describe, expect, it } from 'vitest';

import {
  hasReachedVideoPilotRetryCeiling,
  resolveVideoPilotDuration,
  VIDEO_PILOT_PAID_RETRY_CEILING,
} from './video-pilot-gate.util';

describe('resolveVideoPilotDuration', () => {
  it('returns the provider minimum when the requested duration is longer', () => {
    expect(resolveVideoPilotDuration(10, [5, 10])).toBe(5);
    expect(resolveVideoPilotDuration(8, [4, 6, 8])).toBe(4);
  });

  it('returns null when the request is already the minimum or has no options', () => {
    expect(resolveVideoPilotDuration(5, [5, 10])).toBeNull();
    expect(resolveVideoPilotDuration(10, [])).toBeNull();
    expect(resolveVideoPilotDuration(0, [5, 10])).toBeNull();
  });
});

describe('hasReachedVideoPilotRetryCeiling', () => {
  it('halts at the default of three rejected paid candidates', () => {
    expect(VIDEO_PILOT_PAID_RETRY_CEILING).toBe(3);
    expect(hasReachedVideoPilotRetryCeiling(2)).toBe(false);
    expect(hasReachedVideoPilotRetryCeiling(3)).toBe(true);
  });
});
