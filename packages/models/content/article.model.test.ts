import {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/contracts';
import type { IArticle, ITag } from '@genfeedai/contracts/interfaces';
import {
  createBaseEntity,
  createBrand,
  createOrganization,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Article: class BaseArticle {
    public content?: string;
    public coverImageUrl?: string;
    public user?: { handle?: string };
    public brand?: unknown;
    public tags?: unknown[];
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public handle?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/tag.model', () => ({
  Tag: class Tag {
    public label?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Article } from '@models/content/article.model';

const createTag = (partial: Partial<ITag> = {}): ITag => ({
  ...createBaseEntity<ITag>(partial),
  backgroundColor: '#000000',
  brand: createBrand(),
  category: 'Article' as never,
  label: 'tag',
  organization: createOrganization(),
  textColor: '#ffffff',
  user: createUser(),
  ...partial,
});

const createArticle = (partial: Partial<IArticle> = {}) =>
  new Article({
    ...createBaseEntity<IArticle>(partial),
    category: ArticleCategory.GUIDE,
    content: 'Hello world',
    label: 'Test article',
    organization: createOrganization(),
    scope: AssetScope.BRAND,
    slug: 'test-article',
    status: ArticleStatus.DRAFT,
    summary: 'Summary',
    user: createUser(),
    ...partial,
  });

describe('Article', () => {
  describe('constructor', () => {
    it('should create an article instance', () => {
      const article = createArticle({ content: 'Hello world' });
      expect(article.content).toBe('Hello world');
    });

    it('should instantiate populated brand', () => {
      const article = createArticle({
        brand: createBrand({ id: 'brand-1', label: 'Test Brand' }),
      });
      expect(article.brand).toBeDefined();
    });

    it('should instantiate populated user', () => {
      const article = createArticle({
        user: createUser({ handle: 'johndoe' }),
      });
      expect(article.user).toBeDefined();
    });

    it('should instantiate populated tags array', () => {
      const article = createArticle({
        tags: [createTag({ label: 'tag1' }), createTag({ label: 'tag2' })],
      });
      expect(article.tags).toHaveLength(2);
    });

    it('should not wrap brand when not an object', () => {
      const article = createArticle({ brand: 'brand-id' as never });
      expect(article.brand).toBe('brand-id');
    });
  });

  describe('coverImageUrl', () => {
    it('should preserve the persisted cover image URL', () => {
      const article = createArticle({
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
      });
      expect(article.coverImageUrl).toBe('https://cdn.example.com/cover.jpg');
    });
  });

  describe('wordCount', () => {
    it('should return 0 when content is empty', () => {
      const article = createArticle({ content: '' });
      expect(article.wordCount).toBe(0);
    });

    it('should return 0 when content is undefined', () => {
      const article = createArticle({ content: undefined as never });
      expect(article.wordCount).toBe(0);
    });

    it('should count words correctly', () => {
      const article = createArticle({
        content: 'Hello world this is a test',
      });
      expect(article.wordCount).toBe(6);
    });

    it('should handle multiple spaces between words', () => {
      const article = createArticle({
        content: 'Hello   world   test',
      });
      expect(article.wordCount).toBe(3);
    });

    it('should handle single word', () => {
      const article = createArticle({ content: 'Hello' });
      expect(article.wordCount).toBe(1);
    });
  });

  describe('readingTime', () => {
    it('should return 0 for empty content', () => {
      const article = createArticle({ content: '' });
      expect(article.readingTime).toBe(0);
    });

    it('should return 1 for short content', () => {
      const article = createArticle({
        content: 'A short sentence.',
      });
      expect(article.readingTime).toBe(1);
    });

    it('should calculate reading time at 200 wpm', () => {
      const words = Array.from({ length: 400 }, () => 'word').join(' ');
      const article = createArticle({ content: words });
      expect(article.readingTime).toBe(2);
    });

    it('should round up fractional reading times', () => {
      const words = Array.from({ length: 201 }, () => 'word').join(' ');
      const article = createArticle({ content: words });
      expect(article.readingTime).toBe(2);
    });
  });

  describe('author', () => {
    it('should return user handle', () => {
      const article = createArticle({
        user: createUser({ handle: 'jane_doe' }),
      });
      expect(article.author).toBe('jane_doe');
    });

    it('should return undefined when user is missing', () => {
      const article = createArticle({ user: undefined as never });
      expect(article.author).toBeUndefined();
    });

    it('should return undefined when user has no handle', () => {
      const article = createArticle({ user: createUser({ handle: '' }) });
      expect(article.author).toBeUndefined();
    });
  });
});
