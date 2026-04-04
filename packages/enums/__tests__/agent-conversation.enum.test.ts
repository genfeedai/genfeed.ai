import { describe, expect, it } from 'vitest';
import { AgentMessageRole } from '../src/agent-conversation.enum';

describe('agent-conversation.enum', () => {
  describe('AgentMessageRole', () => {
    it('should have 4 members', () => {
      expect(Object.values(AgentMessageRole)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(AgentMessageRole.USER).toBe('user');
      expect(AgentMessageRole.ASSISTANT).toBe('assistant');
      expect(AgentMessageRole.SYSTEM).toBe('system');
      expect(AgentMessageRole.TOOL).toBe('tool');
    });
  });
});
