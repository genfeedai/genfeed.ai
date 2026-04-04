import { EnvironmentService } from '@services/core/environment.service';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    cdnUrl: 'https://cdn.genfeed.ai',
    ingredientsEndpoint: 'https://api.genfeed.ai/ingredients',
  },
}));

describe('reference.util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveIngredientReferenceUrl', () => {
    it('should return null for null input', () => {
      expect(resolveIngredientReferenceUrl(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(resolveIngredientReferenceUrl(undefined)).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(resolveIngredientReferenceUrl([])).toBeNull();
    });

    it('should resolve URL from string ID', () => {
      const result = resolveIngredientReferenceUrl('ref-123');
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/ref-123`,
      );
    });

    it('should resolve URL from string ID in array', () => {
      const result = resolveIngredientReferenceUrl(['ref-123']);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/ref-123`,
      );
    });

    it('should resolve URL from asset object with URL starting with http', () => {
      const asset = {
        id: 'asset-1',
        url: 'https://example.com/image.jpg',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe('https://example.com/image.jpg');
    });

    it('should resolve URL from asset object with URL starting with references/', () => {
      const asset = {
        id: 'asset-1',
        url: 'references/ref-123',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/references/ref-123`,
      );
    });

    it('should resolve URL from asset object with URL starting with /references/', () => {
      const asset = {
        id: 'asset-1',
        url: '/references/ref-123',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/references/ref-123`,
      );
    });

    it('should resolve URL from asset object with URL starting with ingredients/', () => {
      const asset = {
        id: 'asset-1',
        url: 'ingredients/img-123',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(`${EnvironmentService.cdnUrl}/ingredients/img-123`);
    });

    it('should resolve URL from asset object with URL starting with /ingredients/', () => {
      const asset = {
        id: 'asset-1',
        url: '/ingredients/img-123',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(`${EnvironmentService.cdnUrl}/ingredients/img-123`);
    });

    it('should resolve URL from asset object with normalized URL', () => {
      const asset = {
        id: 'asset-1',
        url: 'custom-path/image.jpg',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/custom-path/image.jpg`,
      );
    });

    it('should resolve URL from asset object using ID when URL is empty', () => {
      const asset = {
        id: 'asset-123',
        url: '',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/asset-123`,
      );
    });

    it('should resolve URL from asset object using ID when URL is whitespace', () => {
      const asset = {
        id: 'asset-123',
        url: '   ',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/asset-123`,
      );
    });

    it('should resolve URL from asset object using ID when URL is not provided', () => {
      const asset = {
        id: 'asset-123',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/asset-123`,
      );
    });

    it('should return null when asset has no URL or ID', () => {
      const asset = {};
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBeNull();
    });

    it('should return null when asset has empty ID', () => {
      const asset = {
        id: '',
        url: '',
      };
      const result = resolveIngredientReferenceUrl(asset);
      expect(result).toBeNull();
    });

    it('should handle array with multiple items and use first one', () => {
      const assets = [
        { id: 'asset-1', url: 'https://example.com/first.jpg' },
        { id: 'asset-2', url: 'https://example.com/second.jpg' },
      ];
      const result = resolveIngredientReferenceUrl(assets);
      expect(result).toBe('https://example.com/first.jpg');
    });

    it('should handle array with string IDs', () => {
      const ids = ['ref-1', 'ref-2'];
      const result = resolveIngredientReferenceUrl(ids);
      expect(result).toBe(
        `${EnvironmentService.ingredientsEndpoint}/images/ref-1`,
      );
    });
  });
});
