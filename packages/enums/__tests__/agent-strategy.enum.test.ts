import { describe, expect, it } from 'vitest';
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
    it('should have 3 members', () => {
      expect(Object.values(AgentRunStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AgentRunStatus.COMPLETED).toBe('completed');
      expect(AgentRunStatus.FAILED).toBe('failed');
      expect(AgentRunStatus.BUDGET_EXHAUSTED).toBe('budget_exhausted');
    });
  });
});
