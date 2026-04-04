import { describe, expect, it } from 'vitest';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
  WorkflowTrigger,
} from '../src/workflow.enum';

describe('workflow.enum', () => {
  describe('WorkflowTrigger', () => {
    it('should have 4 members', () => {
      expect(Object.values(WorkflowTrigger)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(WorkflowTrigger.MANUAL).toBe('manual');
      expect(WorkflowTrigger.ON_VIDEO_COMPLETE).toBe('on-video-complete');
      expect(WorkflowTrigger.ON_IMAGE_COMPLETE).toBe('on-image-complete');
      expect(WorkflowTrigger.SCHEDULED).toBe('scheduled');
    });
  });

  describe('WorkflowStatus', () => {
    it('should have 6 members', () => {
      expect(Object.values(WorkflowStatus)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(WorkflowStatus.DRAFT).toBe('draft');
      expect(WorkflowStatus.ACTIVE).toBe('active');
      expect(WorkflowStatus.PAUSED).toBe('paused');
      expect(WorkflowStatus.COMPLETED).toBe('completed');
      expect(WorkflowStatus.FAILED).toBe('failed');
      expect(WorkflowStatus.RUNNING).toBe('running');
    });
  });

  describe('WorkflowStepCategory', () => {
    it('should have 17 members', () => {
      expect(Object.values(WorkflowStepCategory)).toHaveLength(17);
    });

    it('should have correct values', () => {
      expect(WorkflowStepCategory.TRANSFORM).toBe('transform');
      expect(WorkflowStepCategory.UPSCALE).toBe('upscale');
      expect(WorkflowStepCategory.RESIZE).toBe('resize');
      expect(WorkflowStepCategory.CAPTION).toBe('caption');
      expect(WorkflowStepCategory.CLIP).toBe('clip');
      expect(WorkflowStepCategory.PUBLISH).toBe('publish');
      expect(WorkflowStepCategory.WEBHOOK).toBe('webhook');
      expect(WorkflowStepCategory.DELAY).toBe('delay');
      expect(WorkflowStepCategory.GENERATE_IMAGE).toBe('generate-image');
      expect(WorkflowStepCategory.GENERATE_VIDEO).toBe('generate-video');
      expect(WorkflowStepCategory.GENERATE_MUSIC).toBe('generate-music');
      expect(WorkflowStepCategory.GENERATE_ARTICLE).toBe('generate-article');
      expect(WorkflowStepCategory.COLOR_GRADE).toBe('color-grade');
      expect(WorkflowStepCategory.GENERATE_HOOK).toBe('generate-hook');
      expect(WorkflowStepCategory.TEXT_OVERLAY).toBe('text-overlay');
      expect(WorkflowStepCategory.IMAGE_BATCH).toBe('image-batch');
      expect(WorkflowStepCategory.PERFORMANCE_TRACK).toBe('performance-track');
    });
  });

  describe('WorkflowStepStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(WorkflowStepStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(WorkflowStepStatus.PENDING).toBe('pending');
      expect(WorkflowStepStatus.PROCESSING).toBe('processing');
      expect(WorkflowStepStatus.COMPLETED).toBe('completed');
      expect(WorkflowStepStatus.FAILED).toBe('failed');
      expect(WorkflowStepStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('WorkflowRecurrenceType', () => {
    it('should have 6 members', () => {
      expect(Object.values(WorkflowRecurrenceType)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(WorkflowRecurrenceType.ONCE).toBe('once');
      expect(WorkflowRecurrenceType.EVERY_30_MIN).toBe('every-30-min');
      expect(WorkflowRecurrenceType.HOURLY).toBe('hourly');
      expect(WorkflowRecurrenceType.DAILY).toBe('daily');
      expect(WorkflowRecurrenceType.WEEKLY).toBe('weekly');
      expect(WorkflowRecurrenceType.MONTHLY).toBe('monthly');
    });
  });

  describe('WorkflowLifecycle', () => {
    it('should have 3 members', () => {
      expect(Object.values(WorkflowLifecycle)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(WorkflowLifecycle.DRAFT).toBe('draft');
      expect(WorkflowLifecycle.PUBLISHED).toBe('published');
      expect(WorkflowLifecycle.ARCHIVED).toBe('archived');
    });
  });

  describe('WorkflowExecutionStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(WorkflowExecutionStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(WorkflowExecutionStatus.PENDING).toBe('pending');
      expect(WorkflowExecutionStatus.RUNNING).toBe('running');
      expect(WorkflowExecutionStatus.COMPLETED).toBe('completed');
      expect(WorkflowExecutionStatus.FAILED).toBe('failed');
      expect(WorkflowExecutionStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('WorkflowExecutionTrigger', () => {
    it('should have 4 members', () => {
      expect(Object.values(WorkflowExecutionTrigger)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(WorkflowExecutionTrigger.MANUAL).toBe('manual');
      expect(WorkflowExecutionTrigger.SCHEDULED).toBe('scheduled');
      expect(WorkflowExecutionTrigger.EVENT).toBe('event');
      expect(WorkflowExecutionTrigger.API).toBe('api');
    });
  });
});
