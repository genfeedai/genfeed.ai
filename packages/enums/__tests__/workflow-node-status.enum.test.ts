import { describe, expect, it } from 'vitest';
import { WorkflowNodeStatus } from '../src/workflow-node-status.enum';

describe('workflow-node-status.enum', () => {
  describe('WorkflowNodeStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(WorkflowNodeStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(WorkflowNodeStatus.IDLE).toBe('idle');
      expect(WorkflowNodeStatus.PENDING).toBe('pending');
      expect(WorkflowNodeStatus.PROCESSING).toBe('processing');
      expect(WorkflowNodeStatus.COMPLETE).toBe('complete');
      expect(WorkflowNodeStatus.ERROR).toBe('error');
    });
  });
});
