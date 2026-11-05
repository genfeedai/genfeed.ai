import { describe, expect, it } from 'vitest';
import type { WideEventRecord } from './wide-event.interface';
import {
  shouldKeepWideEvent,
  WIDE_EVENT_BASELINE_SAMPLE_RATE,
  WIDE_EVENT_SLOW_JOB_MS,
  WIDE_EVENT_SLOW_MS,
} from './wide-event.sampling';

function createEvent(fields: Record<string, unknown>): WideEventRecord {
  return {
    duration_ms: 30,
    kind: 'http',
    outcome: 'success',
    request_id: 'req-1',
    service: 'api',
    span_id: 'span-1',
    status_code: 200,
    timestamp: '2026-11-05T00:00:00.000Z',
    trace_id: 'trace-1',
    ...fields,
  };
}

const NEVER_SAMPLED = () => 0.99;
const ALWAYS_SAMPLED = () => 0;

describe('shouldKeepWideEvent', () => {
  it.each([
    ['a server error', { outcome: 'error', status_code: 500 }],
    [
      'a job failure',
      { kind: 'job', outcome: 'error', status_code: undefined },
    ],
    ['an auth rejection', { outcome: 'client_error', status_code: 401 }],
    ['a forbidden request', { outcome: 'client_error', status_code: 403 }],
    ['a validation failure', { outcome: 'client_error', status_code: 400 }],
    ['a slow request', { duration_ms: WIDE_EVENT_SLOW_MS + 1 }],
    [
      'a very slow job',
      { duration_ms: WIDE_EVENT_SLOW_JOB_MS + 1, kind: 'job' },
    ],
    ['an enterprise user', { user: { subscription_tier: 'enterprise' } }],
    ['a super admin', { user: { is_super_admin: true } }],
  ])('always keeps %s', (_label, fields) => {
    const event = createEvent(fields);

    expect(shouldKeepWideEvent(event, NEVER_SAMPLED)).toBe(true);
    expect(event.sample_rate).toBe(1);
  });

  it.each([
    ['a 404 probe', { outcome: 'client_error', status_code: 404 }],
    ['a rate-limited request', { outcome: 'client_error', status_code: 429 }],
    ['a job that ran for a minute', { duration_ms: 60_000, kind: 'job' }],
    ['a fast success', {}],
  ])('thins %s to the baseline rate', (_label, fields) => {
    expect(shouldKeepWideEvent(createEvent(fields), NEVER_SAMPLED)).toBe(false);

    const kept = createEvent(fields);
    expect(shouldKeepWideEvent(kept, ALWAYS_SAMPLED)).toBe(true);
    expect(kept.sample_rate).toBe(WIDE_EVENT_BASELINE_SAMPLE_RATE);
  });
});
