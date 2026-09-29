import { describe, expect, it } from 'vitest';
import {
  FanvueChatbotCreatorStatus,
  FanvueChatbotMessageRole,
} from '../../src/enums/fanvue-chatbot.enum';

describe('fanvue-chatbot.enum', () => {
  describe('FanvueChatbotMessageRole', () => {
    it('should have correct values', () => {
      expect(FanvueChatbotMessageRole.FAN).toBe('fan');
      expect(FanvueChatbotMessageRole.CREATOR).toBe('creator');
    });
  });

  describe('FanvueChatbotCreatorStatus', () => {
    it('should have correct values', () => {
      expect(FanvueChatbotCreatorStatus.ACTIVE).toBe('active');
      expect(FanvueChatbotCreatorStatus.INACTIVE).toBe('inactive');
      expect(FanvueChatbotCreatorStatus.PAUSED).toBe('paused');
    });
  });
});
