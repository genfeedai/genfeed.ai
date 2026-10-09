import { describe, expect, it } from 'vitest';
import {
  getStudioSurfaceFlagKey,
  isStudioSurfaceEnabled,
} from './studio-surface-flags';

describe('Studio surface flags', () => {
  it.each([
    ['/acme/brand/studio/motion', 'studio_motion'],
    ['/acme/brand/studio/storyboard/new', 'studio_storyboard'],
    ['/acme/brand/studio/clips/clip-1?tab=highlights', 'studio_clips'],
    ['/acme/brand/studio/batch/new', 'studio_batch'],
    ['/acme/~/studio/editor/new', 'studio_editor'],
    ['/studio/editor', 'studio_editor'],
  ])('maps %s to %s', (path, flagKey) => {
    expect(getStudioSurfaceFlagKey(path)).toBe(flagKey);
  });

  it.each([
    '/acme/brand/studio',
    '/acme/brand/studio/playground',
    '/acme/brand/studio/motionless',
    '/acme/brand/library/assets',
    '',
    null,
    undefined,
  ])('maps %j to no surface flag', (path) => {
    expect(getStudioSurfaceFlagKey(path)).toBeUndefined();
  });

  it('hides a surface only on an explicit false', () => {
    expect(
      isStudioSurfaceEnabled('/studio/motion', { studio_motion: false }),
    ).toBe(false);
    expect(isStudioSurfaceEnabled('/studio/motion', {})).toBe(true);
    expect(
      isStudioSurfaceEnabled('/studio/playground', { studio_motion: false }),
    ).toBe(true);
  });
});
