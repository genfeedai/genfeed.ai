import { describe, expect, it } from 'vitest';
import {
  RunActionType,
  RunAuthType,
  RunEventType,
  RunMeteringStage,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '../src/run.enum';

describe('run.enum', () => {
  describe('RunActionType', () => {
    it('should have 4 members', () => {
      expect(Object.values(RunActionType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(RunActionType.GENERATE).toBe('generate');
      expect(RunActionType.POST).toBe('post');
      expect(RunActionType.ANALYTICS).toBe('analytics');
      expect(RunActionType.COMPOSITE).toBe('composite');
    });
  });

  describe('RunEventType', () => {
    it('should have 9 members', () => {
      expect(Object.values(RunEventType)).toHaveLength(9);
    });

    it('should have correct values', () => {
      expect(RunEventType.CREATED).toBe('run.created');
      expect(RunEventType.STARTED).toBe('run.started');
      expect(RunEventType.PROGRESS).toBe('run.progress');
      expect(RunEventType.OUTPUT_READY).toBe('run.output.ready');
      expect(RunEventType.ANALYTICS_SNAPSHOT).toBe('run.analytics.snapshot');
      expect(RunEventType.UPDATED).toBe('run.updated');
      expect(RunEventType.COMPLETED).toBe('run.completed');
      expect(RunEventType.FAILED).toBe('run.failed');
      expect(RunEventType.CANCELLED).toBe('run.cancelled');
    });
  });

  describe('RunMeteringStage', () => {
    it('should have 4 members', () => {
      expect(Object.values(RunMeteringStage)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(RunMeteringStage.CREATED).toBe('created');
      expect(RunMeteringStage.EXECUTED).toBe('executed');
      expect(RunMeteringStage.UPDATED).toBe('updated');
      expect(RunMeteringStage.CANCELLED).toBe('cancelled');
    });
  });

  describe('RunStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(RunStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(RunStatus.PENDING).toBe('pending');
      expect(RunStatus.RUNNING).toBe('running');
      expect(RunStatus.COMPLETED).toBe('completed');
      expect(RunStatus.FAILED).toBe('failed');
      expect(RunStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('RunSurface', () => {
    it('should have 6 members', () => {
      expect(Object.values(RunSurface)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(RunSurface.WEB).toBe('web');
      expect(RunSurface.TG).toBe('tg');
      expect(RunSurface.CLI).toBe('cli');
      expect(RunSurface.EXTENSION).toBe('extension');
      expect(RunSurface.IDE).toBe('ide');
      expect(RunSurface.API).toBe('api');
    });
  });

  describe('RunAuthType', () => {
    it('should have 2 members', () => {
      expect(Object.values(RunAuthType)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(RunAuthType.CLERK).toBe('clerk');
      expect(RunAuthType.API_KEY).toBe('api_key');
    });
  });

  describe('RunTrigger', () => {
    it('should have 5 members', () => {
      expect(Object.values(RunTrigger)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(RunTrigger.MANUAL).toBe('manual');
      expect(RunTrigger.API).toBe('api');
      expect(RunTrigger.SCHEDULED).toBe('scheduled');
      expect(RunTrigger.EVENT).toBe('event');
      expect(RunTrigger.AGENT).toBe('agent');
    });
  });
});
