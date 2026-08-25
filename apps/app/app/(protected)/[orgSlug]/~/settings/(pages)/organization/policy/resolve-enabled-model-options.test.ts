import { describe, expect, it } from 'vitest';

import { resolveEnabledModelOptions } from './resolve-enabled-model-options';

describe('resolveEnabledModelOptions', () => {
  it('uses catalog labels instead of raw ids', () => {
    expect(
      resolveEnabledModelOptions(
        ['cmsf5d3q60001ftxne5oxt0jd', 'google/flux-dev'],
        [
          {
            id: 'cmsf5d3q60001ftxne5oxt0jd',
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
      { label: 'FLUX Schnell', value: 'cmsf5d3q60001ftxne5oxt0jd' },
      { label: 'Flux Dev', value: 'google/flux-dev' },
    ]);
  });

  it('falls back to the id when the catalog has no match', () => {
    expect(resolveEnabledModelOptions(['missing-id'], [])).toEqual([
      { label: 'missing-id', value: 'missing-id' },
    ]);
  });
});
