import { IngredientFormat } from '@genfeedai/enums';
import type { IImage, IModel } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildStoryboardInterpolationPairs,
  getStoryboardCameraPrompt,
  resolveStoryboardDuration,
  resolveStoryboardFormat,
  resolveStoryboardModelKey,
} from './storyboard-generation';

const frames = [
  { id: 'frame-1' },
  { id: 'frame-2' },
  { id: 'frame-3' },
] as IImage[];

describe('storyboard generation utils', () => {
  it('builds adjacent interpolation pairs in frame order', () => {
    expect(buildStoryboardInterpolationPairs(frames, ' slow dolly ')).toEqual([
      {
        endImageId: 'frame-2',
        prompt: 'slow dolly',
        startImageId: 'frame-1',
      },
      {
        endImageId: 'frame-3',
        prompt: 'slow dolly',
        startImageId: 'frame-2',
      },
    ]);
  });

  it('omits prompts and invalid frame ids without changing valid order', () => {
    expect(
      buildStoryboardInterpolationPairs([
        { id: 'frame-1' },
        { id: '' },
        { id: 'frame-3' },
      ] as IImage[]),
    ).toEqual([]);
  });

  it('resolves camera prompt, duration, format, and model fallbacks', () => {
    expect(getStoryboardCameraPrompt('zoom-in', '')).toBe(
      'smooth zoom in, focusing on subject',
    );
    expect(getStoryboardCameraPrompt('custom', '  drift left  ')).toBe(
      'drift left',
    );
    expect(resolveStoryboardDuration(12)).toBe(10);
    expect(resolveStoryboardDuration(2)).toBe(3);
    expect(resolveStoryboardFormat(IngredientFormat.LANDSCAPE)).toBe(
      IngredientFormat.LANDSCAPE,
    );
    expect(resolveStoryboardFormat('unknown')).toBe(IngredientFormat.PORTRAIT);
    expect(
      resolveStoryboardModelKey(
        [
          { key: 'fallback-model' },
          { isDefault: true, key: 'default-model' },
        ] as IModel[],
        [],
      ),
    ).toBe('default-model');
    expect(
      resolveStoryboardModelKey([] as IModel[], ['configured-model']),
    ).toBe('configured-model');
  });
});
