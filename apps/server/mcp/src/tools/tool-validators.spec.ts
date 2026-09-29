import {
  Platform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  isPlatform,
  toPlatform,
  toPostStatus,
  toPostVisibility,
  toTargetExecutionState,
} from './tool-validators';

describe('tool-validators', () => {
  it('accepts every canonical Platform value', () => {
    for (const platform of Object.values(Platform)) {
      expect(isPlatform(platform)).toBe(true);
      expect(toPlatform(platform)).toBe(platform);
    }
  });

  it('validates lifecycle and visibility independently', () => {
    for (const state of Object.values(TargetExecutionState)) {
      expect(toTargetExecutionState(state)).toBe(state);
    }
    for (const visibility of Object.values(PostVisibility)) {
      expect(toPostVisibility(visibility)).toBe(visibility);
    }
    expect(toTargetExecutionState(PostVisibility.PRIVATE)).toBeUndefined();
    expect(toPostVisibility(TargetExecutionState.PUBLISHED)).toBeUndefined();
  });

  it('rejects values outside the canonical enums', () => {
    expect(isPlatform('myspace')).toBe(false);
    expect(toPlatform('myspace')).toBeUndefined();
    expect(toPlatform(undefined)).toBeUndefined();
    expect(toPostStatus('published')).toBeUndefined();
    expect(toPostStatus(null)).toBeUndefined();
  });
});
