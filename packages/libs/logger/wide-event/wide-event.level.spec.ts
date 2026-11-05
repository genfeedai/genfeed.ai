import { describe, expect, it } from 'vitest';
import type { WideEventRecord } from './wide-event.interface';
import {
  isWideEventInfo,
  readWideEventLevel,
  summarizeWideEvent,
} from './wide-event.level';

function createEvent(fields: Record<string, unknown>): WideEventRecord {
  return {
    kind: 'http',
    request_id: 'req-1',
    service: 'api',
    span_id: 'span-1',
    timestamp: '2026-11-05T00:00:00.000Z',
    trace_id: 'trace-1',
    ...fields,
  };
}

describe('readWideEventLevel', () => {
  it.each([
    [
      'success',
      { outcome: 'success', status_code: 200, duration_ms: 10 },
      'info',
    ],
    ['a server error', { outcome: 'error', status_code: 500 }, 'error'],
    ['a 401', { outcome: 'client_error', status_code: 401 }, 'warn'],
    ['a 403', { outcome: 'client_error', status_code: 403 }, 'warn'],
    ['a 404', { outcome: 'client_error', status_code: 404 }, 'info'],
    ['a slow request', { outcome: 'success', duration_ms: 2_500 }, 'warn'],
    [
      'a long job',
      { kind: 'job', outcome: 'success', duration_ms: 90_000 },
      'info',
    ],
  ])('logs %s at %s', (_label, fields, level) => {
    expect(readWideEventLevel(createEvent(fields))).toBe(level);
  });
});

describe('summarizeWideEvent', () => {
  it.each([
    [
      {
        duration_ms: 12,
        method: 'GET',
        route: '/v1/posts/:id',
        status_code: 200,
      },
      'GET /v1/posts/:id 200 12ms',
    ],
    [
      { duration_ms: 5, method: 'GET', path: '/v1/unknown', status_code: 404 },
      'GET /v1/unknown 404 5ms',
    ],
    [
      {
        duration_ms: 900,
        job: { attempt: 1, name: 'deduct', queue: 'credits' },
        kind: 'job',
        outcome: 'success',
      },
      'credits:deduct success 900ms',
    ],
  ])('summarises %j', (fields, summary) => {
    expect(summarizeWideEvent(createEvent(fields))).toBe(summary);
  });
});

describe('isWideEventInfo', () => {
  it('recognises only records tagged as wide events', () => {
    expect(isWideEventInfo({ type: 'wide_event' })).toBe(true);
    expect(isWideEventInfo({ type: 'other' })).toBe(false);
    expect(isWideEventInfo({})).toBe(false);
  });
});
