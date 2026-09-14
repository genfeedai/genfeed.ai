import { describe, expect, it } from 'vitest';
import { buildExecutionJsonApiResource } from '../../playwright/e2e/fixtures/api-mocks.fixture';
import {
  buildEmptyElementsAggregatePayload,
  buildUnhandledApiMockBody,
} from '../../playwright/e2e/utils/api-interceptor';

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
  it.each([
    ['workflow execution', undefined],
    ['legacy execution', 'executions'],
  ])(
    'keeps reserved JSON:API members out of %s attributes',
    (_fixtureName, type) => {
      const resource = buildExecutionJsonApiResource(
        'exec-top-level',
        {
          id: 'exec-attributes',
          status: 'running',
          type: 'reserved-attributes-type',
        },
        type,
      );

      expect(resource).toEqual({
        attributes: {
          status: 'running',
        },
        id: 'exec-top-level',
        type: type ?? 'workflow-executions',
      });
      expect(resource.attributes).not.toHaveProperty('id');
      expect(resource.attributes).not.toHaveProperty('type');
    },
  );

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

  it('returns a bare array for brand account-health, not JSON:API', () => {
    expect(
      buildUnhandledApiMockBody(
        'https://api.genfeed.ai/v1/credentials/brand/brand-1/account-health',
      ),
    ).toEqual([]);
  });

  it('returns a bare array for brand publishing-readiness, not JSON:API', () => {
    expect(
      buildUnhandledApiMockBody(
        'https://api.genfeed.ai/v1/credentials/brand/brand-1/publishing-readiness',
      ),
    ).toEqual([]);
  });

  it.each([
    '/agent/threads/thread-1/work-objects',
    '/agent/threads/thread-1/work-objects?sessionId=session-1',
    '/agent/threads/thread-1/work-objects/work-1/actions',
    '/agent/threads/thread-1/work-objects/work-1/actions?sessionId=session-1',
    '/agent/threads/thread%2F1/work-objects/work%3F1/actions',
  ])('matches the conversation work collection response for %s', (path) => {
    expect(
      buildUnhandledApiMockBody(`https://api.genfeed.ai/v1${path}`),
    ).toEqual({ workObjects: [], sessionAssets: [] });
  });

  it.each([
    '/batches',
    '/agent/threads/thread-1/work-objects-summary',
    '/agent/threads/thread-1/work-objects/work-1',
    '/agent/threads/thread-1/work-objects/actions',
    '/agent/threads/thread-1/work-objects//actions',
    '/agent/threads/thread-1/work-objects/work-1/actions/extra',
    '/agent/threads/thread-1/work-objects/work-1/nested/actions',
    '/agent/threads/thread-1/work-objects/work-1/actions-preview',
    '/agent/threads//work-objects/work-1/actions',
    '/work-objects/work-1/actions',
  ])('keeps the JSON:API collection fallback for %s', (path) => {
    expect(
      buildUnhandledApiMockBody(`https://api.genfeed.ai/v1${path}`),
    ).toEqual({ data: [], meta: { totalCount: 0 } });
  });
});
