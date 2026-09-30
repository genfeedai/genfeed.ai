import { describe, expect, it } from 'vitest';
import { VoiceProvider } from '../../src/enums/voice.enum';

describe('voice.enum', () => {
  describe('VoiceProvider', () => {
    it('should have 4 members', () => {
      expect(Object.values(VoiceProvider)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(VoiceProvider.HEYGEN).toBe('HEYGEN');
      expect(VoiceProvider.ELEVENLABS).toBe('ELEVENLABS');
      expect(VoiceProvider.HEDRA).toBe('HEDRA');
      expect(VoiceProvider.GENFEED_AI).toBe('GENFEED_AI');
    });
  });
});
