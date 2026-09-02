import { createHmac } from 'node:crypto';
import {
  buildXActivityCrcResponseBody,
  buildXActivityCrcResponseToken,
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
});
