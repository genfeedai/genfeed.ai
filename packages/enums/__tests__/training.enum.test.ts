import { describe, expect, it } from 'vitest';
import {
  TrainingCategory,
  TrainingProvider,
  TrainingStage,
  TrainingStatus,
} from '../src/training.enum';

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
    it('should have 7 members', () => {
      expect(Object.values(TrainingStage)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(TrainingStage.QUEUED).toBe('queued');
      expect(TrainingStage.PREPROCESSING).toBe('preprocessing');
      expect(TrainingStage.TRAINING).toBe('training');
      expect(TrainingStage.POSTPROCESSING).toBe('postprocessing');
      expect(TrainingStage.UPLOADING).toBe('uploading');
      expect(TrainingStage.COMPLETED).toBe('completed');
      expect(TrainingStage.FAILED).toBe('failed');
    });
  });
});
