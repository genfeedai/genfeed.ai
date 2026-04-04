import { describe, expect, it } from 'vitest';
import { ApiKeyCategory, ApiKeyScope } from '../src/api-key.enum';

describe('api-key.enum', () => {
  describe('ApiKeyCategory', () => {
    it('should have 5 members', () => {
      expect(Object.values(ApiKeyCategory)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ApiKeyCategory.GENFEEDAI).toBe('genfeedai');
      expect(ApiKeyCategory.ELEVENLABS).toBe('elevenlabs');
      expect(ApiKeyCategory.HEDRA).toBe('hedra');
      expect(ApiKeyCategory.HEYGEN).toBe('heygen');
      expect(ApiKeyCategory.OPUS_PRO).toBe('opuspro');
    });
  });

  describe('ApiKeyScope', () => {
    it('should have 20 members', () => {
      expect(Object.values(ApiKeyScope)).toHaveLength(20);
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
      expect(ApiKeyScope.POSTS_CREATE).toBe('posts:create');
      expect(ApiKeyScope.ANALYTICS_READ).toBe('analytics:read');
      expect(ApiKeyScope.ADMIN).toBe('admin');
    });
  });
});
