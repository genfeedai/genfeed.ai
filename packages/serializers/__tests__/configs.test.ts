import { AssetScope, Platform } from '@genfeedai/enums';
import { articleAttributes } from '@serializers/attributes/content/article.attributes';
import { postAttributes } from '@serializers/attributes/content/post.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { articleSerializerConfig } from '@serializers/configs/content/article.config';
import { postSerializerConfig } from '@serializers/configs/content/post.config';
import { metadataSerializerConfig } from '@serializers/configs/ingredients/metadata.config';
import { Serializer } from 'ts-jsonapi';

describe('Serializer Configurations', () => {
  describe('Post Serializer Config', () => {
    test('should have correct structure', () => {
      expect(postSerializerConfig).toHaveProperty('type', 'post');
      expect(postSerializerConfig).toHaveProperty('attributes');
      expect(postSerializerConfig).toHaveProperty('ingredients');
      expect(postSerializerConfig).toHaveProperty('credential');
      expect(postSerializerConfig).toHaveProperty('user');
      expect(postSerializerConfig).toHaveProperty('tags');
    });

    test('should use correct attributes', () => {
      expect(postSerializerConfig.attributes).toBe(postAttributes);
    });

    test('should have ingredients relationship configuration', () => {
      const ingredients = postSerializerConfig.ingredients;

      expect(ingredients).toHaveProperty('ref', '_id');
      expect(ingredients).toHaveProperty('type', 'ingredient');
      expect(ingredients).toHaveProperty('attributes');
      expect(ingredients).toHaveProperty('metadata');

      expect(Array.isArray(ingredients.attributes)).toBe(true);
    });

    test('should have credential relationship configuration', () => {
      const credential = postSerializerConfig.credential;

      expect(credential).toHaveProperty('ref', '_id');
      expect(credential).toHaveProperty('type', 'credential');
      expect(credential).toHaveProperty('attributes');

      expect(Array.isArray(credential.attributes)).toBe(true);
    });

    test('should have user relationship configuration', () => {
      const user = postSerializerConfig.user;

      expect(user).toHaveProperty('ref', '_id');
      expect(user).toHaveProperty('type', 'user');
      expect(user).toHaveProperty('attributes');

      expect(Array.isArray(user.attributes)).toBe(true);
    });

    test('should have tags relationship configuration', () => {
      const tags = postSerializerConfig.tags;

      expect(tags).toHaveProperty('ref', '_id');
      expect(tags).toHaveProperty('type', 'tag');
      expect(tags).toHaveProperty('attributes');

      expect(tags.attributes).toBeDefined();
    });

    test('should create working serializer', () => {
      const serializer = new Serializer('post', {
        ...postSerializerConfig,
        id: 'id',
      });

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should serialize post data correctly', () => {
      const serializer = new Serializer('post', {
        ...postSerializerConfig,
        id: 'id',
      });

      const testData = {
        description: 'Test description',
        id: 'post-123',
        label: 'Test Post',
        platform: Platform.TWITTER,
        status: 'published',
      };

      const result = serializer.serialize(testData);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type', 'posts');
      expect(result.data).toHaveProperty('id', 'post-123');
      expect(result.data).toHaveProperty('attributes');

      // Check attributes
      expect(result.data.attributes).toHaveProperty('label', 'Test Post');
      expect(result.data.attributes).toHaveProperty(
        'description',
        'Test description',
      );
      expect(result.data.attributes).toHaveProperty('status', 'published');
    });

    test('should serialize review and lineage attributes', () => {
      const serializer = new Serializer('post', {
        ...postSerializerConfig,
        id: 'id',
      });

      const result = serializer.serialize({
        generationId: 'gen-123',
        id: 'post-123',
        promptUsed: 'Write a launch post',
        reviewBatchId: 'batch-1',
        reviewDecision: 'approved',
        reviewItemId: 'item-1',
        sourceActionId: 'action-1',
        sourceWorkflowName: 'Clip Workflow',
      });

      expect(result.data.attributes).toHaveProperty('generation-id', 'gen-123');
      expect(result.data.attributes).toHaveProperty(
        'prompt-used',
        'Write a launch post',
      );
      expect(result.data.attributes).toHaveProperty(
        'review-batch-id',
        'batch-1',
      );
      expect(result.data.attributes).toHaveProperty(
        'review-decision',
        'approved',
      );
      expect(result.data.attributes).toHaveProperty('review-item-id', 'item-1');
      expect(result.data.attributes).toHaveProperty(
        'source-workflow-name',
        'Clip Workflow',
      );
    });
  });

  describe('Article Serializer Config', () => {
    test('should have correct structure', () => {
      expect(articleSerializerConfig).toHaveProperty('type', 'article');
      expect(articleSerializerConfig).toHaveProperty('attributes');
    });

    test('should use correct attributes', () => {
      expect(articleSerializerConfig.attributes).toBe(articleAttributes);
    });

    test('should create working serializer', () => {
      const serializer = new Serializer('article', {
        ...articleSerializerConfig,
        id: 'id',
      });

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should serialize article data correctly', () => {
      const serializer = new Serializer('article', {
        ...articleSerializerConfig,
        id: 'id',
      });

      const testData = {
        banner: 'banner-123',
        bannerUrl: 'https://example.com/image.jpg',
        content: 'Test content',
        id: 'art-123',
        label: 'Test Article',
        publishedAt: '2023-01-01T00:00:00Z',
        scope: AssetScope.PUBLIC,
        slug: 'test-article',
        status: 'published',
        summary: 'Test summary',
      };

      const result = serializer.serialize(testData);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type', 'articles');
      expect(result.data).toHaveProperty('id', 'art-123');
      expect(result.data).toHaveProperty('attributes');

      // Check attributes (matching actual articleAttributes)
      expect(result.data.attributes).toHaveProperty('label', 'Test Article');
      expect(result.data.attributes).toHaveProperty('slug', 'test-article');
      expect(result.data.attributes).toHaveProperty('summary', 'Test summary');
      expect(result.data.attributes).toHaveProperty('content', 'Test content');
    });
  });

  describe('Metadata Serializer Config', () => {
    test('should have correct structure', () => {
      expect(metadataSerializerConfig).toHaveProperty('type', 'metadata');
      expect(metadataSerializerConfig).toHaveProperty('attributes');
    });

    test('should use correct attributes', () => {
      expect(metadataSerializerConfig.attributes).toBe(metadataAttributes);
    });

    test('should create working serializer', () => {
      const serializer = new Serializer('metadata', {
        ...metadataSerializerConfig,
        id: 'id',
      });

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should serialize metadata data correctly', () => {
      const serializer = new Serializer('metadata', {
        ...metadataSerializerConfig,
        id: 'id',
      });

      const testData = {
        description: 'Test description',
        duration: 120,
        extension: 'mp4',
        fps: 30,
        height: 1080,
        id: 'meta-123',
        label: 'Test Metadata',
        resolution: '1080p',
        size: 50000000,
        width: 1920,
      };

      const result = serializer.serialize(testData);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type', 'metadata');
      expect(result.data).toHaveProperty('id', 'meta-123');
      expect(result.data).toHaveProperty('attributes');

      // Check attributes (matching actual metadataAttributes)
      expect(result.data.attributes).toHaveProperty('width', 1920);
      expect(result.data.attributes).toHaveProperty('height', 1080);
      expect(result.data.attributes).toHaveProperty('fps', 30);
      expect(result.data.attributes).toHaveProperty('duration', 120);
    });
  });

  describe('Attribute Arrays', () => {
    test('postAttributes should be an array', () => {
      expect(Array.isArray(postAttributes)).toBe(true);
      expect(postAttributes.length).toBeGreaterThan(0);
    });

    test('articleAttributes should be an array', () => {
      expect(Array.isArray(articleAttributes)).toBe(true);
      expect(articleAttributes.length).toBeGreaterThan(0);
    });

    test('metadataAttributes should be an array', () => {
      expect(Array.isArray(metadataAttributes)).toBe(true);
      expect(metadataAttributes.length).toBeGreaterThan(0);
    });

    test('postAttributes should contain expected fields', () => {
      expect(postAttributes).toContain('label');
      expect(postAttributes).toContain('description');
      expect(postAttributes).toContain('status');
      expect(postAttributes).toContain('platform');
    });

    test('articleAttributes should contain expected fields', () => {
      expect(articleAttributes).toContain('label');
      expect(articleAttributes).toContain('slug');
      expect(articleAttributes).toContain('summary');
      expect(articleAttributes).toContain('content');
      expect(articleAttributes).toContain('status');
    });
  });

  describe('Serializer Integration Tests', () => {
    test('should handle null values gracefully', () => {
      const serializer = new Serializer('post', {
        ...postSerializerConfig,
        id: 'id',
      });

      const testData = {
        description: null,
        id: 'post-123',
        label: 'Test Post',
        status: 'published',
      };

      const result = serializer.serialize(testData);

      expect(result.data.attributes).toHaveProperty('label', 'Test Post');
      expect(result.data.attributes).toHaveProperty('description', null);
    });

    test('should handle missing relationships', () => {
      const serializer = new Serializer('post', {
        ...postSerializerConfig,
        id: 'id',
      });

      const testData = {
        id: 'post-123',
        label: 'Test Post',
        status: 'published',
        // No relationships provided
      };

      // Should serialize without error even when relationships are missing
      const result = serializer.serialize(testData);

      expect(result.data).toHaveProperty('id', 'post-123');
      expect(result.data).toHaveProperty('attributes');
    });
  });
});
