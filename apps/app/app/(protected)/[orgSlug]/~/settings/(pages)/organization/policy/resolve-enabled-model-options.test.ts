import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import { resolveEnabledModelOptions } from './resolve-enabled-model-options';

const modelId = testId('model');

describe('resolveEnabledModelOptions', () => {
  it('uses catalog labels instead of raw ids', () => {
    expect(
      resolveEnabledModelOptions(
        [modelId, 'google/flux-dev'],
        [
          {
            id: modelId,
            key: 'black-forest-labs/flux-schnell',
            label: 'FLUX Schnell',
          },
          {
            id: 'other-id',
            key: 'google/flux-dev',
            label: 'Flux Dev',
          },
        ],
      ),
    ).toEqual([
      { label: 'FLUX Schnell', value: modelId },
      { label: 'Flux Dev', value: 'google/flux-dev' },
    ]);
  });

  it('falls back to the id when the catalog has no match', () => {
    expect(resolveEnabledModelOptions(['missing-id'], [])).toEqual([
      { label: 'missing-id', value: 'missing-id' },
    ]);
  });
});
