import { describe, expect, it } from 'vitest';
import { redactEmailTrackingUrl } from './email-tracking-url.util';

describe('email tracking telemetry', () => {
  it('redacts capabilities in relative and absolute request URLs', () => {
    expect(
      redactEmailTrackingUrl('/v1/email-performance/click/secret-token'),
    ).toBe('/v1/email-performance/click/[redacted]');
    expect(
      redactEmailTrackingUrl(
        'https://api.test/v1/email-performance/click/token?x=1',
      ),
    ).toBe('https://api.test/v1/email-performance/click/[redacted]?x=1');
    expect(redactEmailTrackingUrl('/users/me')).toBe('/users/me');
  });
});
