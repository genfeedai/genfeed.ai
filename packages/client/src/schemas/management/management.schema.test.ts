import {
  apiKeySchema,
  updateApiKeySchema,
} from '@genfeedai/client/schemas/management/api-key.schema';
import { tagSchema } from '@genfeedai/client/schemas/management/tag.schema';
import { watchlistSchema } from '@genfeedai/client/schemas/management/watchlist.schema';
import { Platform } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('management schemas', () => {
  describe('apiKeySchema', () => {
    it('accepts valid', () => {
      expect(apiKeySchema.safeParse({ name: 'Key' }).success).toBe(true);
    });

    it('rejects empty name', () => {
      expect(apiKeySchema.safeParse({ name: '' }).success).toBe(false);
    });

    it('accepts optional fields', () => {
      expect(
        apiKeySchema.safeParse({
          description: 'D',
          expiresAt: '2025-01-01',
          name: 'K',
          rateLimit: 100,
          scopes: ['read'],
        }).success,
      ).toBe(true);
    });
  });

  describe('updateApiKeySchema', () => {
    it('all fields optional', () => {
      expect(updateApiKeySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('tagSchema', () => {
    it('accepts valid tag', () => {
      expect(tagSchema.safeParse({ label: 'Tag' }).success).toBe(true);
    });

    it('rejects empty label', () => {
      expect(tagSchema.safeParse({ label: '' }).success).toBe(false);
    });

    it('rejects invalid key format', () => {
      expect(tagSchema.safeParse({ key: 'BAD KEY', label: 'T' }).success).toBe(
        false,
      );
    });

    it('accepts valid key', () => {
      expect(tagSchema.safeParse({ key: 'my-tag', label: 'T' }).success).toBe(
        true,
      );
    });
  });

  describe('watchlistSchema', () => {
    it('accepts valid', () => {
      expect(
        watchlistSchema.safeParse({
          brand: 'b',
          handle: '@t',
          name: 'N',
          platform: Platform.INSTAGRAM,
        }).success,
      ).toBe(true);
    });

    it('rejects empty brand', () => {
      expect(
        watchlistSchema.safeParse({
          brand: '',
          handle: '@t',
          name: 'N',
          platform: Platform.INSTAGRAM,
        }).success,
      ).toBe(false);
    });

    it('rejects invalid platform', () => {
      expect(
        watchlistSchema.safeParse({
          brand: 'b',
          handle: '@t',
          name: 'N',
          platform: 'invalid',
        }).success,
      ).toBe(false);
    });
  });
});
