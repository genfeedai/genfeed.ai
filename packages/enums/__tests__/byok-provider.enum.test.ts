import { describe, expect, it } from 'vitest';
import { ByokProvider } from '../src/byok-provider.enum';

describe('byok-provider.enum', () => {
  describe('ByokProvider', () => {
    it('should have 11 members', () => {
      expect(Object.values(ByokProvider)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(ByokProvider.ANTHROPIC).toBe('anthropic');
      expect(ByokProvider.OPENAI).toBe('openai');
      expect(ByokProvider.OPENROUTER).toBe('openrouter');
      expect(ByokProvider.ELEVENLABS).toBe('elevenlabs');
      expect(ByokProvider.REPLICATE).toBe('replicate');
      expect(ByokProvider.FAL).toBe('fal');
      expect(ByokProvider.HEYGEN).toBe('heygen');
      expect(ByokProvider.HEDRA).toBe('hedra');
      expect(ByokProvider.KLINGAI).toBe('klingai');
      expect(ByokProvider.LEONARDOAI).toBe('leonardoai');
      expect(ByokProvider.HIGGSFIELD).toBe('higgsfield');
    });
  });
});
