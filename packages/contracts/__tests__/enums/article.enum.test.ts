import { describe, expect, it } from 'vitest';
import {
  ArticleCategory,
  ArticleScope,
  ArticleStatus,
} from '../../src/enums/article.enum';

describe('article.enum', () => {
  describe('ArticleStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(ArticleStatus)).toHaveLength(5);
    });

    it('should match Prisma SCREAMING_SNAKE for persisted members', () => {
      expect(ArticleStatus.DRAFT).toBe('DRAFT');
      expect(ArticleStatus.PUBLISHED).toBe('PUBLISHED');
      expect(ArticleStatus.ARCHIVED).toBe('ARCHIVED');
      expect(ArticleStatus.PROCESSING).toBe('PROCESSING');
      expect(ArticleStatus.FAILED).toBe('FAILED');
    });
  });

  describe('ArticleCategory', () => {
    it('should have 14 members', () => {
      expect(Object.values(ArticleCategory)).toHaveLength(14);
    });

    it('should have correct values', () => {
      expect(ArticleCategory.POST).toBe('post');
      expect(ArticleCategory.TUTORIAL).toBe('tutorial');
      expect(ArticleCategory.GUIDE).toBe('guide');
      expect(ArticleCategory.NEWS).toBe('news');
      expect(ArticleCategory.ANNOUNCEMENT).toBe('announcement');
      expect(ArticleCategory.ANALYSIS).toBe('analysis');
      expect(ArticleCategory.REVIEW).toBe('review');
      expect(ArticleCategory.INTERVIEW).toBe('interview');
      expect(ArticleCategory.ARTICLE).toBe('article');
      expect(ArticleCategory.WHITEPAPER).toBe('whitepaper');
      expect(ArticleCategory.ESSAY).toBe('essay');
      expect(ArticleCategory.LISTICLE).toBe('listicle');
      expect(ArticleCategory.LINKEDIN_ARTICLE).toBe('linkedin-article');
      expect(ArticleCategory.X_ARTICLE).toBe('x-article');
    });
  });

  describe('ArticleScope (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(ArticleScope).toBeDefined();
      expect(Object.keys(ArticleScope).length).toBeGreaterThan(0);
    });
  });
});
