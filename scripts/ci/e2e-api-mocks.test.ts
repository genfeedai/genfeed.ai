import { describe, expect, it } from 'vitest';
import { buildEmptyElementsAggregatePayload } from '../../playwright/e2e/utils/api-interceptor';

const ELEMENT_COLLECTION_KEYS = [
  'blacklists',
  'cameraMovements',
  'cameras',
  'lenses',
  'lightings',
  'moods',
  'scenes',
  'sounds',
  'styles',
] as const;

describe('Playwright API mocks', () => {
  it('matches the aggregate elements JSON:API contract used by the app shell', () => {
    const payload = buildEmptyElementsAggregatePayload();

    expect(Array.isArray(payload.data)).toBe(false);
    expect(Object.keys(payload.data).sort()).toEqual(
      [...ELEMENT_COLLECTION_KEYS].sort(),
    );

    for (const key of ELEMENT_COLLECTION_KEYS) {
      expect(payload.data[key]).toEqual({
        data: [],
        meta: {
          page: 1,
          pageSize: 0,
          totalCount: 0,
        },
      });
    }
  });
});
