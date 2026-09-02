import { describe, expect, it } from 'vitest';
import {
  ApiKeyCategory,
  ApiKeyScope,
  hasExplicitApiKeyAdminScope,
} from '../../src/enums/api-key.enum';

describe('api-key.enum', () => {
  describe('ApiKeyCategory', () => {
    it('should have 5 members', () => {
      expect(Object.values(ApiKeyCategory)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ApiKeyCategory.GENFEEDAI).toBe('GENFEEDAI');
      expect(ApiKeyCategory.ELEVENLABS).toBe('ELEVENLABS');
      expect(ApiKeyCategory.HEDRA).toBe('HEDRA');
      expect(ApiKeyCategory.HEYGEN).toBe('HEYGEN');
      expect(ApiKeyCategory.OPUS_PRO).toBe('OPUS_PRO');
    });
  });

  describe('ApiKeyScope', () => {
    it('should have 25 members', () => {
      expect(Object.values(ApiKeyScope)).toHaveLength(25);
    });

    it('should have correct values', () => {
      expect(ApiKeyScope.VIDEOS_READ).toBe('videos:read');
      expect(ApiKeyScope.VIDEOS_CREATE).toBe('videos:create');
      expect(ApiKeyScope.VIDEOS_UPDATE).toBe('videos:update');
      expect(ApiKeyScope.VIDEOS_DELETE).toBe('videos:delete');
      expect(ApiKeyScope.IMAGES_READ).toBe('images:read');
      expect(ApiKeyScope.IMAGES_CREATE).toBe('images:create');
      expect(ApiKeyScope.IMAGES_UPDATE).toBe('images:update');
      expect(ApiKeyScope.IMAGES_DELETE).toBe('images:delete');
      expect(ApiKeyScope.PROMPTS_READ).toBe('prompts:read');
      expect(ApiKeyScope.PROMPTS_CREATE).toBe('prompts:create');
      expect(ApiKeyScope.PROMPTS_UPDATE).toBe('prompts:update');
      expect(ApiKeyScope.PROMPTS_DELETE).toBe('prompts:delete');
      expect(ApiKeyScope.ARTICLES_READ).toBe('articles:read');
      expect(ApiKeyScope.ARTICLES_CREATE).toBe('articles:create');
      expect(ApiKeyScope.BRANDS_READ).toBe('brands:read');
      expect(ApiKeyScope.CREDITS_READ).toBe('credits:read');
      expect(ApiKeyScope.CREDITS_PROVISION).toBe('credits:provision');
      expect(ApiKeyScope.MANAGED_INFERENCE_EXECUTE).toBe(
        'managed-inference:execute',
      );
      expect(ApiKeyScope.POSTS_CREATE).toBe('posts:create');
      expect(ApiKeyScope.POSTS_DRAFT).toBe('posts:draft');
      expect(ApiKeyScope.POSTS_SCHEDULE).toBe('posts:schedule');
      expect(ApiKeyScope.POSTS_APPROVE).toBe('posts:approve');
      expect(ApiKeyScope.POSTS_PUBLISH).toBe('posts:publish');
      expect(ApiKeyScope.ANALYTICS_READ).toBe('analytics:read');
      expect(ApiKeyScope.ADMIN).toBe('admin');
    });
  });

  describe('hasExplicitApiKeyAdminScope', () => {
    it('is true only for an explicit admin grant', () => {
      expect(hasExplicitApiKeyAdminScope(['admin'])).toBe(true);
      expect(hasExplicitApiKeyAdminScope(['videos:read', 'admin'])).toBe(true);
    });

    it('does not treat wildcards, empty, or content scopes as admin', () => {
      expect(hasExplicitApiKeyAdminScope(undefined)).toBe(false);
      expect(hasExplicitApiKeyAdminScope([])).toBe(false);
      expect(hasExplicitApiKeyAdminScope(['*'])).toBe(false);
      expect(hasExplicitApiKeyAdminScope(['videos:read'])).toBe(false);
    });
  });
});
