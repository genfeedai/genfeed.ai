import { describe, expect, it } from 'vitest';
import {
  PostCategory,
  PostEntityModel,
  PostFrequency,
  PostStatus,
} from '../src/post.enum';

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

  describe('PostCategory', () => {
    it('should have 7 members', () => {
      expect(Object.values(PostCategory)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(PostCategory.ARTICLE).toBe('article');
      expect(PostCategory.VIDEO).toBe('video');
      expect(PostCategory.POST).toBe('post');
      expect(PostCategory.REEL).toBe('reel');
      expect(PostCategory.STORY).toBe('story');
      expect(PostCategory.IMAGE).toBe('image');
      expect(PostCategory.TEXT).toBe('text');
    });
  });

  describe('PostEntityModel', () => {
    it('should have 2 members', () => {
      expect(Object.values(PostEntityModel)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(PostEntityModel.INGREDIENT).toBe('Ingredient');
      expect(PostEntityModel.ARTICLE).toBe('Article');
    });
  });
});
