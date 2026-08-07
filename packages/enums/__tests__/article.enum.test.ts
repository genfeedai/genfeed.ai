import { describe, expect, it } from 'vitest';
import {
  ArticleCategory,
  ArticleScope,
  ArticleStatus,
  TranscriptStatus,
} from '../src/article.enum';

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
    it('should have 13 members', () => {
      expect(Object.values(ArticleCategory)).toHaveLength(13);
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
      expect(ArticleCategory.TRANSCRIPT).toBe('transcript');
      expect(ArticleCategory.WHITEPAPER).toBe('whitepaper');
      expect(ArticleCategory.ESSAY).toBe('essay');
      expect(ArticleCategory.LISTICLE).toBe('listicle');
      expect(ArticleCategory.X_ARTICLE).toBe('x-article');
    });
  });

  describe('TranscriptStatus', () => {
    it('should have 6 members', () => {
      expect(Object.values(TranscriptStatus)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(TranscriptStatus.PENDING).toBe('pending');
      expect(TranscriptStatus.DOWNLOADING).toBe('downloading');
      expect(TranscriptStatus.TRANSCRIBING).toBe('transcribing');
      expect(TranscriptStatus.GENERATING_ARTICLE).toBe('generating-article');
      expect(TranscriptStatus.GENERATED).toBe('generated');
      expect(TranscriptStatus.FAILED).toBe('failed');
    });
  });

  describe('ArticleScope (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(ArticleScope).toBeDefined();
      expect(Object.keys(ArticleScope).length).toBeGreaterThan(0);
    });
  });
});
