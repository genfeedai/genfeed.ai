import { describe, expect, it } from 'vitest';
import { AgentExecutionStatus } from '../src/agent-run.enum';
import { AgentRunFrequency, AgentRunStatus } from '../src/agent-strategy.enum';

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

  describe('AgentRunStatus', () => {
    it('matches Prisma AgentRunStatus labels plus domain BUDGET_EXHAUSTED', () => {
      expect(Object.values(AgentRunStatus)).toEqual([
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'BUDGET_EXHAUSTED',
      ]);
    });

    it('overlaps AgentExecutionStatus 1:1 for Prisma-backed labels', () => {
      for (const status of Object.values(AgentExecutionStatus)) {
        expect(Object.values(AgentRunStatus)).toContain(status);
      }
    });
  });
});
