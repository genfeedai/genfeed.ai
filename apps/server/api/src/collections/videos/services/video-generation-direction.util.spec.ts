import {
  buildVideoDirection,
  humanizeStudioToken,
} from '@api/collections/videos/services/video-generation-direction.util';
import { describe, expect, it } from 'vitest';

describe('humanizeStudioToken', () => {
  it('turns element slugs into words and leaves prose alone', () => {
    expect(humanizeStudioToken('3d-animated')).toBe('3D animated');
    expect(humanizeStudioToken('slow push-in')).toBe('slow push-in');
    expect(humanizeStudioToken('studio')).toBe('studio');
    expect(humanizeStudioToken('85mm-portrait')).toBe('85mm portrait');
  });
});

describe('buildVideoDirection', () => {
  const picks = {
    camera: 'full-body wide shot',
    cameraMovement: 'static',
    duration: 10,
    lens: '50mm',
    scene: 'studio',
    style: '3d-animated',
  };

  it('labels the picks for the compiled prompt', () => {
    expect(buildVideoDirection(picks).brief).toEqual({
      composition: 'Camera: full-body wide shot, 50mm',
      motion: 'Camera movement: static',
      scene: 'Setting: studio',
      visualDirection: 'Style: 3D animated',
    });
  });

  it('gives the enhancer the same lines plus the clip length', () => {
    expect(buildVideoDirection(picks).enhancer).toEqual({
      durationSeconds: 10,
      lines: [
        'Setting: studio',
        'Camera: full-body wide shot, 50mm',
        'Camera movement: static',
        'Style: 3D animated',
      ],
    });
  });

  it('keeps both style and mood and omits unset picks', () => {
    expect(
      buildVideoDirection({ mood: 'calm', style: 'cinematic' }).brief,
    ).toEqual({ visualDirection: 'Style: cinematic. Mood: calm' });
    expect(buildVideoDirection({})).toEqual({
      brief: {},
      enhancer: { lines: [] },
    });
  });
});
