import { describe, expect, it } from 'vitest';
import { VoiceProvider } from '../src/voice.enum';

describe('voice.enum', () => {
  describe('VoiceProvider', () => {
    it('should have 4 members', () => {
      expect(Object.values(VoiceProvider)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(VoiceProvider.HEYGEN).toBe('heygen');
      expect(VoiceProvider.ELEVENLABS).toBe('elevenlabs');
      expect(VoiceProvider.HEDRA).toBe('hedra');
      expect(VoiceProvider.GENFEED_AI).toBe('genfeed-ai');
    });
  });
});
