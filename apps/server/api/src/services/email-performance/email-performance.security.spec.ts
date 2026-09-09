import { createHmac } from 'node:crypto';
import {
  approvedEmailDestination,
  verifyEmailWebhook,
} from '@api/services/email-performance/email-performance.security';

describe('email performance security', () => {
  const secret = `whsec_${Buffer.from('test-secret-only').toString('base64')}`;
  const body = Buffer.from('{"type":"email.delivered"}');
  const timestamp = '1788955200';
  const id = 'event-1';
  const signature = `v1,${createHmac('sha256', Buffer.from('test-secret-only')).update(`${id}.${timestamp}.`).update(body).digest('base64')}`;

  it('verifies exact raw bytes with a fresh signed event ID and timestamp', () => {
    expect(
      verifyEmailWebhook(
        body,
        { id, timestamp, signature },
        secret,
        Number(timestamp) * 1000,
      ),
    ).toBe(true);
    expect(
      verifyEmailWebhook(
        Buffer.from('{}'),
        { id, timestamp, signature },
        secret,
        Number(timestamp) * 1000,
      ),
    ).toBe(false);
    expect(
      verifyEmailWebhook(
        body,
        { id: 'forged-id', timestamp, signature },
        secret,
        Number(timestamp) * 1000,
      ),
    ).toBe(false);
  });

  it('rejects stale replay, missing signatures and malformed secrets', () => {
    expect(
      verifyEmailWebhook(
        body,
        { id, timestamp, signature },
        secret,
        Number(timestamp) * 1000 + 301000,
      ),
    ).toBe(false);
    expect(
      verifyEmailWebhook(
        body,
        { id, timestamp },
        secret,
        Number(timestamp) * 1000,
      ),
    ).toBe(false);
    expect(
      verifyEmailWebhook(
        body,
        { id, timestamp, signature },
        '',
        Number(timestamp) * 1000,
      ),
    ).toBe(false);
  });

  it('accepts same-origin destinations and rejects external or executable redirects', () => {
    expect(
      approvedEmailDestination('/assets/asset-1', 'https://app.example.test'),
    ).toBe('https://app.example.test/assets/asset-1');
    const credentialedDestination = new URL('https://app.example.test');
    credentialedDestination.username = 'test-user';
    credentialedDestination.password = 'test-password';
    for (const url of [
      'https://evil.test',
      '//evil.test',
      'javascript:alert(1)',
      'https://app.example.test@evil.test',
      credentialedDestination.toString(),
    ]) {
      expect(() =>
        approvedEmailDestination(url, 'https://app.example.test'),
      ).toThrow();
    }
  });
});
