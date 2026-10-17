import { createHmac } from 'node:crypto';
import {
  buildXActivityCrcResponseBody,
  buildXActivityCrcResponseToken,
  verifyXActivitySignature,
} from '@api/services/reply-bot/x-activity-crc.util';
import { describe, expect, it } from 'vitest';

describe('x-activity-crc.util', () => {
  it('builds sha256= base64 HMAC response token', () => {
    const crcToken = 'test-crc-token';
    const secret = 'consumer-secret';
    const expected = `sha256=${createHmac('sha256', secret)
      .update(crcToken, 'utf8')
      .digest('base64')}`;

    expect(buildXActivityCrcResponseToken(crcToken, secret)).toBe(expected);
    expect(buildXActivityCrcResponseBody(crcToken, secret)).toEqual({
      response_token: expected,
    });
  });

  describe('verifyXActivitySignature', () => {
    const secret = 'consumer-secret';
    const body = Buffer.from('{"for_user_id":"1"}');
    const sign = (payload: Buffer, key: string) =>
      `sha256=${createHmac('sha256', key).update(payload).digest('base64')}`;

    it('accepts a signature over the exact raw body', () => {
      expect(verifyXActivitySignature(body, sign(body, secret), secret)).toBe(
        true,
      );
    });

    it('rejects a missing, malformed, or wrong-key signature', () => {
      expect(verifyXActivitySignature(body, undefined, secret)).toBe(false);
      expect(verifyXActivitySignature(body, 'sha256=short', secret)).toBe(
        false,
      );
      expect(verifyXActivitySignature(body, sign(body, 'other'), secret)).toBe(
        false,
      );
    });

    it('rejects a signature computed over a different body', () => {
      const tampered = Buffer.from('{"for_user_id":"2"}');
      expect(
        verifyXActivitySignature(tampered, sign(body, secret), secret),
      ).toBe(false);
    });
  });
});
