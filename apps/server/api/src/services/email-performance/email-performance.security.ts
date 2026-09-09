import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SignedEmailWebhookHeaders } from '@api/services/email-performance/email-performance.types';

export function emailIdentityHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function approvedEmailDestination(
  destination: string,
  appUrl: string,
): string {
  const app = new URL(appUrl);
  const url = new URL(destination, app);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.origin !== app.origin ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Email destination must belong to the configured application',
    );
  }
  return url.toString();
}

export function verifyEmailWebhook(
  body: Buffer,
  headers: SignedEmailWebhookHeaders,
  secret: string,
  now = Date.now(),
): boolean {
  const timestamp = Number(headers.timestamp);
  if (
    !headers.id ||
    !headers.timestamp ||
    !headers.signature ||
    !Number.isInteger(timestamp) ||
    Math.abs(now / 1000 - timestamp) > 300 ||
    !secret.startsWith('whsec_')
  )
    return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  if (!key.length) return false;
  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.`)
    .update(body)
    .digest();
  return headers.signature.split(' ').some((signature) => {
    const [version, encoded] = signature.split(',');
    if (version !== 'v1' || !encoded) return false;
    const actual = Buffer.from(encoded, 'base64');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}
