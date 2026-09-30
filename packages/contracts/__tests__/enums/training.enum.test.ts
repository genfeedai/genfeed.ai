import { describe, expect, it } from 'vitest';
import {
  TrainingCategory,
  TrainingProvider,
  TrainingStage,
  TrainingStatus,
} from '../../src/enums/training.enum';

describe('training.enum', () => {
  describe('TrainingCategory', () => {
    it('should have 2 members', () => {
      expect(Object.values(TrainingCategory)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(TrainingCategory.SUBJECT).toBe('subject');
      expect(TrainingCategory.STYLE).toBe('style');
    });
  });

  describe('TrainingStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(TrainingStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(TrainingStatus.PROCESSING).toBe('processing');
      expect(TrainingStatus.COMPLETED).toBe('completed');
      expect(TrainingStatus.FAILED).toBe('failed');
    });
  });

  describe('TrainingProvider', () => {
    it('should have 2 members', () => {
      expect(Object.values(TrainingProvider)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(TrainingProvider.REPLICATE).toBe('replicate');
      expect(TrainingProvider.GENFEED_AI).toBe('genfeed-ai');
    });
  });

  describe('TrainingStage', () => {
    it('should have 6 members matching Prisma', () => {
      expect(Object.values(TrainingStage)).toHaveLength(6);
    });

    it('should match Prisma SCREAMING_SNAKE', () => {
      expect(TrainingStage.PENDING).toBe('PENDING');
      expect(TrainingStage.UPLOADING).toBe('UPLOADING');
      expect(TrainingStage.TRAINING).toBe('TRAINING');
      expect(TrainingStage.READY).toBe('READY');
      expect(TrainingStage.FAILED).toBe('FAILED');
      expect(TrainingStage.CANCELLED).toBe('CANCELLED');
    });
  });
});
