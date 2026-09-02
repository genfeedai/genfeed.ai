import { describe, expect, it } from 'vitest';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowTrigger,
} from '../../src/enums/workflow.enum';

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
      expect(WorkflowExecutionStatus.PENDING).toBe('PENDING');
      expect(WorkflowExecutionStatus.RUNNING).toBe('RUNNING');
      expect(WorkflowExecutionStatus.COMPLETED).toBe('COMPLETED');
      expect(WorkflowExecutionStatus.FAILED).toBe('FAILED');
      expect(WorkflowExecutionStatus.CANCELLED).toBe('CANCELLED');
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
