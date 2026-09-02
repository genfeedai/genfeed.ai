import { describe, expect, it } from 'vitest';
import {
  AgentRunFrequency,
  AgentStrategyRunStatus,
} from '../../src/enums/agent-strategy.enum';
import { WorkflowExecutionStatus } from '../../src/enums/workflow.enum';

describe('agent-strategy.enum', () => {
  describe('AgentRunFrequency', () => {
    it('should have 3 members', () => {
      expect(Object.values(AgentRunFrequency)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AgentRunFrequency.EVERY_6_HOURS).toBe('every_6_hours');
      expect(AgentRunFrequency.TWICE_DAILY).toBe('twice_daily');
      expect(AgentRunFrequency.DAILY).toBe('daily');
    });
  });

  describe('AgentStrategyRunStatus', () => {
    it('matches the execution-plane labels plus domain BUDGET_EXHAUSTED', () => {
      expect(Object.values(AgentStrategyRunStatus)).toEqual([
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'BUDGET_EXHAUSTED',
      ]);
    });

    it('is a strict superset of WorkflowExecutionStatus', () => {
      for (const status of Object.values(WorkflowExecutionStatus)) {
        expect(Object.values(AgentStrategyRunStatus)).toContain(status);
      }
    });
  });
});
