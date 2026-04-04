import * as crypto from 'node:crypto';
import { TelegramAuthUtil } from '@api/shared/utils/telegram-auth/telegram-auth.util';
import { describe, expect, it } from 'vitest';

const BOT_TOKEN = 'test-bot-token-123456';

type TelegramAuthPayload = Record<string, string | number> & {
  auth_date: number;
  hash?: string;
  id: number;
};

function generateValidAuthData(
  botToken: string,
  data: TelegramAuthPayload,
): TelegramAuthPayload & { hash: string } {
  const { hash: _hash, ...dataToSign } = data;
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const dataCheckString = Object.keys(dataToSign)
    .sort()
    .map((key) => `${key}=${dataToSign[key]}`)
    .join('\n');
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  return { ...dataToSign, hash: hmac };
}

describe('TelegramAuthUtil', () => {
  describe('verifyAuthData()', () => {
    it('returns true for valid auth data', () => {
      const data = {
        auth_date: Math.floor(Date.now() / 1000),
        first_name: 'Test',
        id: 12345,
        username: 'testuser',
      };
      const authData = generateValidAuthData(BOT_TOKEN, data);
      expect(TelegramAuthUtil.verifyAuthData(authData, BOT_TOKEN)).toBe(true);
    });

    it('returns false when hash is missing', () => {
      expect(
        TelegramAuthUtil.verifyAuthData(
          { id: '123', username: 'test' },
          BOT_TOKEN,
        ),
      ).toBe(false);
    });

    it('returns false with invalid hash', () => {
      const authData = {
        hash: 'invalid-hash',
        id: '123',
        username: 'test',
      };
      expect(TelegramAuthUtil.verifyAuthData(authData, BOT_TOKEN)).toBe(false);
    });

    it('returns false when data is tampered', () => {
      const data = {
        auth_date: Math.floor(Date.now() / 1000),
        id: 12345,
        username: 'testuser',
      };
      const authData = generateValidAuthData(BOT_TOKEN, data);
      // Tamper the data
      authData.id = 99999;
      expect(TelegramAuthUtil.verifyAuthData(authData, BOT_TOKEN)).toBe(false);
    });
  });

  describe('isAuthDateValid()', () => {
    it('returns true for recent auth data', () => {
      const authDate = Math.floor(Date.now() / 1000);
      expect(TelegramAuthUtil.isAuthDateValid(authDate)).toBe(true);
    });

    it('returns false for old auth data (> 24 hours)', () => {
      const oldDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
      expect(TelegramAuthUtil.isAuthDateValid(oldDate)).toBe(false);
    });

    it('accepts custom max age in seconds', () => {
      const recentDate = Math.floor(Date.now() / 1000) - 10;
      expect(TelegramAuthUtil.isAuthDateValid(recentDate, 30)).toBe(true);
    });
  });

  describe('hasRequiredFields()', () => {
    it('returns true when all required fields are present', () => {
      const authData = {
        auth_date: 1234567890,
        first_name: 'Test',
        hash: 'abc123',
        id: 12345,
      };
      expect(TelegramAuthUtil.hasRequiredFields(authData)).toBe(true);
    });

    it('returns false when required fields are missing', () => {
      const authData = { id: 12345 };
      expect(TelegramAuthUtil.hasRequiredFields(authData)).toBe(false);
    });
  });
});
