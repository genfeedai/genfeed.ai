import { describe, expect, it } from 'vitest';
import { BotGatewayResponseType } from '../src/bot-response.enum';

describe('bot-response.enum', () => {
  describe('BotGatewayResponseType', () => {
    it('should have 4 members', () => {
      expect(Object.values(BotGatewayResponseType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(BotGatewayResponseType.DEFERRED).toBe('deferred');
      expect(BotGatewayResponseType.TEXT).toBe('text');
      expect(BotGatewayResponseType.ERROR).toBe('error');
      expect(BotGatewayResponseType.MEDIA).toBe('media');
    });
  });
});
