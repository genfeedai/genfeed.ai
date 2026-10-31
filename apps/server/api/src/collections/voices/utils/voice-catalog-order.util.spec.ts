import { buildVoiceCatalogOrderBy } from '@api/collections/voices/utils/voice-catalog-order.util';
import { describe, expect, it } from 'vitest';

describe('buildVoiceCatalogOrderBy', () => {
  it.each([undefined, '', 'createdAt: -1', 'sampleAudioUrl: 1'])(
    'falls back to name for %j',
    (sort) => {
      expect(buildVoiceCatalogOrderBy(sort)).toEqual([
        { name: 'asc' },
        { id: 'asc' },
      ]);
    },
  );

  it.each([
    ['name: -1', [{ name: 'desc' }, { id: 'asc' }]],
    [
      'provider: 1',
      [{ externalProvider: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    ],
    [
      'externalVoiceId: -1',
      [{ externalId: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    ],
    [
      'language: 1',
      [
        { language: { nulls: 'last', sort: 'asc' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
    ],
    ['status: -1', [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }]],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildVoiceCatalogOrderBy(sort)).toEqual(expected);
  });
});
