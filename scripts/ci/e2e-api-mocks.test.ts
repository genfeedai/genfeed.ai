import type { ICostReportSummary } from '@genfeedai/contracts/interfaces/billing';
import { describe, expect, it, vi } from 'vitest';
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

  it.each([
    'https://api.genfeed.ai/v1',
    'http://genfeed.localhost:3010/v1',
    'http://localhost:3010/v1',
    '/v1',
    '',
  ])('returns a complete empty cost summary resource for %s', (apiUrl) => {
    const from = '2026-09-01T08:30:00.000Z';
    const to = '2026-09-24T16:45:00.000Z';
    const attributes: ICostReportSummary = {
      byBrand: [],
      daily: [],
      from,
      to,
      total: {
        byokCount: 0,
        creditsUsed: 0,
        generationCount: 0,
        llmCount: 0,
        mediaCount: 0,
        providerCostMicros: 0,
        providerCostUsd: 0,
      },
    };
    const params = new URLSearchParams({ from, to });

    expect(
      buildUnhandledApiMockBody(`${apiUrl}/costs/summary?${params}`),
    ).toEqual({
      data: {
        attributes,
        id: 'mock-cost-summary',
        type: 'cost-report-summary',
      },
    });
  });

  it('normalizes date-only cost summary boundaries to complete UTC days', () => {
    expect(
      buildUnhandledApiMockBody(
        'https://api.genfeed.ai/v1/costs/summary?from=2026-09-01&to=2026-09-24',
      ),
    ).toMatchObject({
      data: {
        attributes: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-24T23:59:59.999Z',
        },
      },
    });
  });

  it('defaults the cost summary to the 30 days ending at the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:34:56.789Z'));
    try {
      expect(
        buildUnhandledApiMockBody('https://api.genfeed.ai/v1/costs/summary'),
      ).toMatchObject({
        data: {
          attributes: {
            from: '2026-08-25T12:34:56.789Z',
            to: '2026-09-24T12:34:56.789Z',
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('derives the missing start boundary from the requested end', () => {
    expect(
      buildUnhandledApiMockBody('/v1/costs/summary?to=2026-09-24'),
    ).toMatchObject({
      data: {
        attributes: {
          from: '2026-08-25T23:59:59.999Z',
          to: '2026-09-24T23:59:59.999Z',
        },
      },
    });
  });

  it('uses the current time when only the start boundary is requested', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:34:56.789Z'));
    try {
      expect(
        buildUnhandledApiMockBody('/costs/summary?from=2026-09-01'),
      ).toMatchObject({
        data: {
          attributes: {
            from: '2026-09-01T00:00:00.000Z',
            to: '2026-09-24T12:34:56.789Z',
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    '/costs/entries',
    '/costs/workflows',
    '/workflows',
    '/costs/summary/extra',
    '/nested/costs/summary',
    '/costs/entries?redirect=/costs/summary',
  ])(
    'preserves the collection fallback outside the exact summary path: %s',
    (path) => {
      expect(
        buildUnhandledApiMockBody(`https://api.genfeed.ai/v1${path}`),
      ).toEqual({ data: [], meta: { totalCount: 0 } });
    },
  );

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
