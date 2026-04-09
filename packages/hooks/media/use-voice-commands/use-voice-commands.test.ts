import { useVoiceCommands } from '@hooks/media/use-voice-commands/use-voice-commands';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('useVoiceCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns voice command controls', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current).toHaveProperty('start');
    expect(result.current).toHaveProperty('stop');
    expect(result.current).toHaveProperty('toggle');
    expect(result.current).toHaveProperty('isListening');
    expect(result.current).toHaveProperty('isSupported');
    expect(result.current).toHaveProperty('transcript');
    expect(result.current).toHaveProperty('error');
  });

  it('initializes isListening to false', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current.isListening).toBe(false);
  });

  it('initializes transcript to empty string', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current.transcript).toBe('');
  });

  it('initializes error to null', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current.error).toBeNull();
  });

  it('isSupported is false when SpeechRecognition not available', () => {
    // jsdom doesn't implement SpeechRecognition
    const { result } = renderHook(() => useVoiceCommands());
    // After effects run, isSupported should be false (no speech recognition in jsdom)
    expect(result.current.isSupported).toBe(false);
  });

  it('start() returns false when recognition not available', () => {
    const { result } = renderHook(() => useVoiceCommands());
    let returnVal: boolean | undefined;
    act(() => {
      returnVal = result.current.start();
    });
    expect(returnVal).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('stop() is a no-op when not listening', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(() => {
      act(() => {
        result.current.stop();
      });
    }).not.toThrow();
    expect(result.current.isListening).toBe(false);
  });

  it('toggle() calls start when not listening', () => {
    const { result } = renderHook(() => useVoiceCommands());
    // toggle() when not listening → calls start()
    act(() => {
      result.current.toggle();
    });
    // start() returns false (no recognition) so isListening stays false
    expect(result.current.isListening).toBe(false);
  });

  it('accepts commands array in options', () => {
    const command = {
      action: vi.fn(),
      description: 'Say hello',
      pattern: /hello/i,
    };
    const { result } = renderHook(() =>
      useVoiceCommands({ commands: [command] }),
    );
    expect(result.current).toBeDefined();
  });

  it('accepts onTranscript callback in options', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceCommands({ onTranscript }));
    expect(result.current).toBeDefined();
  });

  it('supports continuous and interimResults options', () => {
    const { result } = renderHook(() =>
      useVoiceCommands({ continuous: true, interimResults: true }),
    );
    expect(result.current).toBeDefined();
  });

  it('supports custom language option', () => {
    const { result } = renderHook(() =>
      useVoiceCommands({ language: 'fr-FR' }),
    );
    expect(result.current).toBeDefined();
  });

  it('cleans up on unmount without throwing', () => {
    const { unmount } = renderHook(() => useVoiceCommands());
    expect(() => unmount()).not.toThrow();
  });
});
