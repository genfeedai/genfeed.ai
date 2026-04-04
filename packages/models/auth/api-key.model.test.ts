import { ApiKey, type IApiKey } from '@models/auth/api-key.model';
import { describe, expect, it } from 'vitest';

describe('ApiKey', () => {
  describe('constructor', () => {
    it('should create with default values when no partial provided', () => {
      const apiKey = new ApiKey();
      expect(apiKey.id).toBe('');
      expect(apiKey.type).toBe('api-keys');
      expect(apiKey.scopes).toEqual([]);
      expect(apiKey.isActive).toBe(true);
      expect(apiKey.createdAt).toBeDefined();
      expect(apiKey.updatedAt).toBeDefined();
    });

    it('should set id and type from partial', () => {
      const partial: Partial<IApiKey> = {
        id: 'key-123',
        type: 'custom-keys',
      };
      const apiKey = new ApiKey(partial);
      expect(apiKey.id).toBe('key-123');
      expect(apiKey.type).toBe('custom-keys');
    });

    it('should extract attributes from partial', () => {
      const partial: Partial<IApiKey> = {
        attributes: {
          description: 'Test API key',
          isActive: true,
          key: 'sk_test_abc123',
          label: 'My Key',
          rateLimit: 100,
          scopes: ['read', 'write'],
        },
        id: 'key-456',
      };
      const apiKey = new ApiKey(partial);
      expect(apiKey.label).toBe('My Key');
      expect(apiKey.name).toBe('My Key');
      expect(apiKey.description).toBe('Test API key');
      expect(apiKey.key).toBe('sk_test_abc123');
      expect(apiKey.scopes).toEqual(['read', 'write']);
      expect(apiKey.rateLimit).toBe(100);
      expect(apiKey.isActive).toBe(true);
    });

    it('should prefer label over name for display name', () => {
      const partial: Partial<IApiKey> = {
        attributes: {
          label: 'Label Value',
          name: 'Name Value',
        },
        id: 'key-789',
      };
      const apiKey = new ApiKey(partial);
      expect(apiKey.label).toBe('Label Value');
      expect(apiKey.name).toBe('Label Value');
    });

    it('should fall back to name when label is not set', () => {
      const partial: Partial<IApiKey> = {
        attributes: {
          name: 'Fallback Name',
        },
        id: 'key-abc',
      };
      const apiKey = new ApiKey(partial);
      expect(apiKey.label).toBe('Fallback Name');
      expect(apiKey.name).toBe('Fallback Name');
    });

    it('should default isActive to true when not explicitly false', () => {
      const apiKey = new ApiKey({ id: 'key-1' });
      expect(apiKey.isActive).toBe(true);
    });

    it('should set isActive to false when explicitly false', () => {
      const apiKey = new ApiKey({
        attributes: { isActive: false },
        id: 'key-2',
      });
      expect(apiKey.isActive).toBe(false);
    });

    it('should handle date attributes', () => {
      const apiKey = new ApiKey({
        attributes: {
          createdAt: '2024-01-01T00:00:00Z',
          expiresAt: '2025-01-01T00:00:00Z',
          lastUsedAt: '2024-06-15T12:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
        id: 'key-3',
      });
      expect(apiKey.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(apiKey.updatedAt).toBe('2024-06-01T00:00:00Z');
      expect(apiKey.expiresAt).toBe('2025-01-01T00:00:00Z');
      expect(apiKey.lastUsedAt).toBe('2024-06-15T12:00:00Z');
    });
  });

  describe('isExpired', () => {
    it('should return false when no expiresAt is set', () => {
      const apiKey = new ApiKey({ id: 'key-1' });
      expect(apiKey.isExpired).toBe(false);
    });

    it('should return true when expiresAt is in the past', () => {
      const apiKey = new ApiKey({
        attributes: { expiresAt: '2020-01-01T00:00:00Z' },
        id: 'key-2',
      });
      expect(apiKey.isExpired).toBe(true);
    });

    it('should return false when expiresAt is in the future', () => {
      const futureDate = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const apiKey = new ApiKey({
        attributes: { expiresAt: futureDate },
        id: 'key-3',
      });
      expect(apiKey.isExpired).toBe(false);
    });
  });

  describe('isMcpKey', () => {
    it('should return true when label contains "mcp"', () => {
      const apiKey = new ApiKey({
        attributes: { label: 'MCP API Key' },
        id: 'key-1',
      });
      expect(apiKey.isMcpKey).toBe(true);
    });

    it('should return true when label contains "mcp" (case-insensitive)', () => {
      const apiKey = new ApiKey({
        attributes: { label: 'My mcp key' },
        id: 'key-2',
      });
      expect(apiKey.isMcpKey).toBe(true);
    });

    it('should return true when description contains "mcp"', () => {
      const apiKey = new ApiKey({
        attributes: {
          description: 'Key for MCP integration',
          label: 'Regular Key',
        },
        id: 'key-3',
      });
      expect(apiKey.isMcpKey).toBe(true);
    });

    it('should return false when neither label nor description contains "mcp"', () => {
      const apiKey = new ApiKey({
        attributes: {
          description: 'Standard API key',
          label: 'Production Key',
        },
        id: 'key-4',
      });
      expect(apiKey.isMcpKey).toBe(false);
    });

    it('should return false when label and description are undefined', () => {
      const apiKey = new ApiKey({ id: 'key-5' });
      expect(apiKey.isMcpKey).toBe(false);
    });
  });
});
