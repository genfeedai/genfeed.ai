import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

function post(body: string): Request {
  return new Request('https://app.genfeed.ai/api/csp-report', {
    body,
    headers: { 'content-type': 'application/csp-report' },
    method: 'POST',
  });
}

function report(blocked: string): string {
  return JSON.stringify({
    'csp-report': {
      'blocked-uri': blocked,
      'effective-directive': 'img-src',
    },
  });
}

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  it('records one warning per directive and blocked origin', async () => {
    const first = await POST(post(report('https://a.test/x.png')));
    await POST(post(report('https://a.test/y.png?sig=1')));
    await POST(post(report('https://b.test/z.png')));

    expect(first.status).toBe(204);
    expect(
      vi
        .mocked(Sentry.captureMessage)
        .mock.calls.map(
          ([, context]) => (context as { tags?: Record<string, string> }).tags,
        ),
    ).toEqual([
      { csp_blocked_origin: 'https://a.test', csp_directive: 'img-src' },
      { csp_blocked_origin: 'https://b.test', csp_directive: 'img-src' },
    ]);
  });

  it('answers 204 and records nothing for extension noise', async () => {
    const response = await POST(post(report('chrome-extension://abc/a.js')));

    expect(response.status).toBe(204);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    expect((await POST(post('nope'))).status).toBe(400);
  });

  it('rejects an oversized body', async () => {
    expect((await POST(post('x'.repeat(20_000)))).status).toBe(413);
  });
});
