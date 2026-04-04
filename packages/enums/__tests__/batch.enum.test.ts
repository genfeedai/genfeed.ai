import { describe, expect, it } from 'vitest';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReferenceImageCategory,
} from '../src/batch.enum';

describe('batch.enum', () => {
  describe('BatchStatus', () => {
    it('should have 6 members', () => {
      expect(Object.values(BatchStatus)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(BatchStatus.PENDING).toBe('pending');
      expect(BatchStatus.GENERATING).toBe('generating');
      expect(BatchStatus.COMPLETED).toBe('completed');
      expect(BatchStatus.PARTIAL).toBe('partial');
      expect(BatchStatus.FAILED).toBe('failed');
      expect(BatchStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('BatchItemStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(BatchItemStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BatchItemStatus.PENDING).toBe('pending');
      expect(BatchItemStatus.GENERATING).toBe('generating');
      expect(BatchItemStatus.COMPLETED).toBe('completed');
      expect(BatchItemStatus.FAILED).toBe('failed');
      expect(BatchItemStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('ContentFormat', () => {
    it('should have 5 members', () => {
      expect(Object.values(ContentFormat)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ContentFormat.IMAGE).toBe('image');
      expect(ContentFormat.VIDEO).toBe('video');
      expect(ContentFormat.CAROUSEL).toBe('carousel');
      expect(ContentFormat.REEL).toBe('reel');
      expect(ContentFormat.STORY).toBe('story');
    });
  });

  describe('ReferenceImageCategory', () => {
    it('should have 4 members', () => {
      expect(Object.values(ReferenceImageCategory)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ReferenceImageCategory.FACE).toBe('face');
      expect(ReferenceImageCategory.PRODUCT).toBe('product');
      expect(ReferenceImageCategory.STYLE).toBe('style');
      expect(ReferenceImageCategory.LOGO).toBe('logo');
    });
  });
});
