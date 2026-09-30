import { describe, expect, it } from 'vitest';
import { DEFAULT_SEND_DM_DATA } from './send-dm';

describe('send-dm node', () => {
  describe('DEFAULT_SEND_DM_DATA', () => {
    it('should have label set to Send DM', () => {
      expect(DEFAULT_SEND_DM_DATA.label).toBe('Send DM');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_SEND_DM_DATA.status).toBe('idle');
    });

    it('should have type set to sendDm', () => {
      expect(DEFAULT_SEND_DM_DATA.type).toBe('sendDm');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_SEND_DM_DATA.platform).toBe('twitter');
    });

    it('should default recipientId and text to empty string', () => {
      expect(DEFAULT_SEND_DM_DATA.recipientId).toBe('');
      expect(DEFAULT_SEND_DM_DATA.text).toBe('');
    });

    it('should default mediaUrl to empty string', () => {
      expect(DEFAULT_SEND_DM_DATA.mediaUrl).toBe('');
    });

    it('should default messageId to null', () => {
      expect(DEFAULT_SEND_DM_DATA.messageId).toBeNull();
    });
  });
});
