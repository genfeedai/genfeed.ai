import { describe, expect, it } from 'vitest';
import {
  FanvueChatbotCreatorStatus,
  FanvueChatbotMessageRole,
} from '../src/fanvue-chatbot.enum';

describe('fanvue-chatbot.enum', () => {
  describe('FanvueChatbotMessageRole', () => {
    it('should have 2 members', () => {
      expect(Object.values(FanvueChatbotMessageRole)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(FanvueChatbotMessageRole.FAN).toBe('fan');
      expect(FanvueChatbotMessageRole.CREATOR).toBe('creator');
    });
  });

  describe('FanvueChatbotCreatorStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(FanvueChatbotCreatorStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(FanvueChatbotCreatorStatus.ACTIVE).toBe('active');
      expect(FanvueChatbotCreatorStatus.INACTIVE).toBe('inactive');
      expect(FanvueChatbotCreatorStatus.PAUSED).toBe('paused');
    });
  });
});
