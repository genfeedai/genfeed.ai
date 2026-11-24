import { describe, expect, it } from 'vitest';

import {
  hasReachedVideoPilotRetryCeiling,
  VIDEO_PILOT_PAID_RETRY_CEILING,
} from './video-pilot-gate.util';

describe('hasReachedVideoPilotRetryCeiling', () => {
  it('halts at the default of three rejected paid candidates', () => {
    expect(VIDEO_PILOT_PAID_RETRY_CEILING).toBe(3);
    expect(hasReachedVideoPilotRetryCeiling(2)).toBe(false);
    expect(hasReachedVideoPilotRetryCeiling(3)).toBe(true);
  });
});
