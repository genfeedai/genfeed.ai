import { playAudio } from '@hooks/media/audio-utils/audio.utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

// Track instances created by Audio constructor
let lastAudioInstance: {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  currentTime: number;
} | null = null;

class MockAudioClass {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  currentTime = 0;

  constructor(_url: string) {
    lastAudioInstance = this as unknown as typeof lastAudioInstance;
  }
}

vi.stubGlobal('Audio', MockAudioClass);

describe('audio.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAudioInstance = null;
    // Reset play mock on the prototype after clearing
    MockAudioClass.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  describe('playAudio', () => {
    it('exports playAudio function', () => {
      expect(playAudio).toBeDefined();
      expect(typeof playAudio).toBe('function');
    });

    it('returns undefined when no url is provided', () => {
      expect(playAudio('')).toBeUndefined();
    });

    it('returns audioElement and stop function for valid url', () => {
      const result = playAudio('https://example.com/audio.mp3');
      expect(result).toBeDefined();
      expect(result?.audioElement).toBeDefined();
      expect(typeof result?.stop).toBe('function');
    });

    it('calls play() on the audio element', () => {
      playAudio('https://example.com/test.mp3');
      expect(lastAudioInstance?.play).toHaveBeenCalled();
    });

    it('registers onEnded listener when provided', () => {
      const onEnded = vi.fn();
      playAudio('https://example.com/audio.mp3', onEnded);
      expect(lastAudioInstance?.addEventListener).toHaveBeenCalledWith(
        'ended',
        onEnded,
      );
    });

    it('does not add ended listener when onEnded not provided', () => {
      playAudio('https://example.com/audio.mp3');
      expect(lastAudioInstance?.addEventListener).not.toHaveBeenCalledWith(
        'ended',
        expect.any(Function),
      );
    });

    it('stop() calls pause()', () => {
      const result = playAudio('https://example.com/audio.mp3');
      result?.stop();
      expect(lastAudioInstance?.pause).toHaveBeenCalled();
    });

    it('stop() removes onEnded listener when provided', () => {
      const onEnded = vi.fn();
      const result = playAudio('https://example.com/audio.mp3', onEnded);
      result?.stop();
      expect(lastAudioInstance?.removeEventListener).toHaveBeenCalledWith(
        'ended',
        onEnded,
      );
    });

    it('stop() does not remove listener when none was provided', () => {
      const result = playAudio('https://example.com/audio.mp3');
      result?.stop();
      expect(lastAudioInstance?.removeEventListener).not.toHaveBeenCalled();
    });
  });
});
