import { describe, expect, it } from 'vitest';
import {
  PostCategory,
  PostEntityModel,
  PostFormat,
  PostFrequency,
  PostStatus,
  PostVisibility,
} from '../../src/enums/post.enum';

describe('post.enum', () => {
  describe('PostStatus', () => {
    it('should have 8 members', () => {
      expect(Object.values(PostStatus)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(PostStatus.PUBLIC).toBe('public');
      expect(PostStatus.PRIVATE).toBe('private');
      expect(PostStatus.UNLISTED).toBe('unlisted');
      expect(PostStatus.DRAFT).toBe('draft');
      expect(PostStatus.SCHEDULED).toBe('scheduled');
      expect(PostStatus.PROCESSING).toBe('processing');
      expect(PostStatus.PENDING).toBe('pending');
      expect(PostStatus.FAILED).toBe('failed');
    });
  });

  describe('PostVisibility', () => {
    it('keeps audience visibility independent from lifecycle', () => {
      expect(Object.values(PostVisibility)).toEqual([
        'public',
        'private',
        'unlisted',
      ]);
    });
  });

  describe('PostFrequency', () => {
    it('should have 5 members', () => {
      expect(Object.values(PostFrequency)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(PostFrequency.DAILY).toBe('daily');
      expect(PostFrequency.WEEKLY).toBe('weekly');
      expect(PostFrequency.MONTHLY).toBe('monthly');
      expect(PostFrequency.YEARLY).toBe('yearly');
      expect(PostFrequency.NEVER).toBe('never');
    });
  });

  describe('PostFormat', () => {
    it('distinguishes standard, long-form, and thread editing shapes', () => {
      expect(PostFormat.STANDARD).toBe('standard');
      expect(PostFormat.LONG_FORM).toBe('long-form');
      expect(PostFormat.THREAD).toBe('thread');
    });
  });

  describe('PostCategory', () => {
    it('should have 7 members', () => {
      expect(Object.values(PostCategory)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(PostCategory.ARTICLE).toBe('ARTICLE');
      expect(PostCategory.VIDEO).toBe('VIDEO');
      expect(PostCategory.POST).toBe('POST');
      expect(PostCategory.REEL).toBe('REEL');
      expect(PostCategory.STORY).toBe('STORY');
      expect(PostCategory.IMAGE).toBe('IMAGE');
      expect(PostCategory.TEXT).toBe('TEXT');
    });
  });

  describe('PostEntityModel', () => {
    it('should have 2 members', () => {
      expect(Object.values(PostEntityModel)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(PostEntityModel.INGREDIENT).toBe('INGREDIENT');
      expect(PostEntityModel.ARTICLE).toBe('ARTICLE');
    });
  });
});
