import { describe, expect, it } from 'vitest';
import {
  ContentFormat,
  ReferenceImageCategory,
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
  TurboRunItemStatus,
  TurboRunStatus,
} from '../../src/enums/turbo.enum';

describe('turbo.enum', () => {
  describe('batch rewrite job wire values', () => {
    it('keeps the API values the Review page reads', () => {
      expect(Object.values(TurboRewriteJobStatus)).toEqual([
        'queued',
        'processing',
        'completed',
        'partially_failed',
        'failed',
        'cancelled',
      ]);
      expect(Object.values(TurboRewriteItemFailureReason)).toEqual([
        'conflict',
        'insufficient_credits',
        'not_rewritable',
        'generation_failed',
      ]);
    });
  });

  describe('TurboRunStatus', () => {
    it('matches the Prisma TurboRunStatus labels 1:1', () => {
      expect(Object.values(TurboRunStatus)).toEqual([
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'PARTIAL',
        'FAILED',
        'CANCELLED',
      ]);
    });
  });

  describe('TurboRunItemStatus', () => {
    it('uses SCREAMING_SNAKE values', () => {
      expect(Object.values(TurboRunItemStatus)).toEqual([
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'SKIPPED',
      ]);
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
      expect(ReferenceImageCategory.FACE).toBe('FACE');
      expect(ReferenceImageCategory.PRODUCT).toBe('PRODUCT');
      expect(ReferenceImageCategory.STYLE).toBe('STYLE');
      expect(ReferenceImageCategory.LOGO).toBe('LOGO');
    });
  });
});
