import { describe, expect, it } from 'vitest';
import { TaskCategory, TaskStatus, TaskType } from '../src/task.enum';

describe('task.enum', () => {
  describe('TaskStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(TaskStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(TaskStatus.COMPLETED).toBe('completed');
      expect(TaskStatus.FAILED).toBe('failed');
      expect(TaskStatus.PENDING).toBe('pending');
      expect(TaskStatus.PROCESSING).toBe('processing');
    });
  });

  describe('TaskCategory', () => {
    it('should have 3 members', () => {
      expect(Object.values(TaskCategory)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(TaskCategory.GENERATION).toBe('generation');
      expect(TaskCategory.EDITING).toBe('editing');
      expect(TaskCategory.VALIDATION).toBe('validation');
    });
  });

  describe('TaskType', () => {
    it('should have 10 members', () => {
      expect(Object.values(TaskType)).toHaveLength(10);
    });

    it('should have correct values', () => {
      expect(TaskType.GENERATE_IMAGE).toBe('generate-image');
      expect(TaskType.GENERATE_VIDEO).toBe('generate-video');
      expect(TaskType.GENERATE_MUSIC).toBe('generate-music');
      expect(TaskType.GENERATE_ARTICLE).toBe('generate-article');
      expect(TaskType.TRANSFORM).toBe('transform');
      expect(TaskType.UPSCALE).toBe('upscale');
      expect(TaskType.RESIZE).toBe('resize');
      expect(TaskType.CAPTION).toBe('caption');
      expect(TaskType.CLIP).toBe('clip');
      expect(TaskType.PUBLISH).toBe('publish');
    });
  });
});
