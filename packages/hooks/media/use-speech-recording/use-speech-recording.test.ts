import { useSpeechRecording } from '@hooks/media/use-speech-recording/use-speech-recording';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn().mockReturnValue({
    getToken: vi.fn().mockResolvedValue('mock-token'),
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@genfeedai/services/ai/speech.service', () => ({
  SpeechService: {
    getInstance: vi.fn().mockReturnValue({
      transcribeAudio: vi.fn().mockResolvedValue({ text: 'test transcript' }),
    }),
  },
}));

describe('useSpeechRecording', () => {
  const originalMediaDevices = globalThis.navigator.mediaDevices;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('returns recording controls', () => {
    const { result } = renderHook(() => useSpeechRecording());
    expect(result.current).toHaveProperty('startRecording');
    expect(result.current).toHaveProperty('stopRecording');
    expect(result.current).toHaveProperty('isRecording');
    expect(result.current).toHaveProperty('isProcessing');
    expect(result.current).toHaveProperty('isSupported');
    expect(result.current).toHaveProperty('error');
  });

  it('initializes isRecording to false', () => {
    const { result } = renderHook(() => useSpeechRecording());
    expect(result.current.isRecording).toBe(false);
  });

  it('initializes isProcessing to false', () => {
    const { result } = renderHook(() => useSpeechRecording());
    expect(result.current.isProcessing).toBe(false);
  });

  it('initializes error to null', () => {
    const { result } = renderHook(() => useSpeechRecording());
    expect(result.current.error).toBeNull();
  });

  it('isSupported reflects browser capabilities', () => {
    const { result } = renderHook(() => useSpeechRecording());
    // jsdom does not support MediaRecorder so isSupported should be false
    expect(typeof result.current.isSupported).toBe('boolean');
  });

  it('accepts onTranscription callback option', () => {
    const onTranscription = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecording({ onTranscription }),
    );
    expect(result.current).toBeDefined();
  });

  it('accepts onError callback option', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecording({ onError }));
    expect(result.current).toBeDefined();
  });

  it('accepts language and prompt options', () => {
    const { result } = renderHook(() =>
      useSpeechRecording({ language: 'fr', prompt: 'test hint' }),
    );
    expect(result.current).toBeDefined();
  });

  it('startRecording returns a boolean or Promise<boolean>', async () => {
    const { result } = renderHook(() => useSpeechRecording());
    // In jsdom MediaRecorder isn't available so it should handle gracefully
    const retVal = await result.current.startRecording();
    expect(typeof retVal).toBe('boolean');
  });

  it('reports microphone permission errors from the browser boundary', async () => {
    const onError = vi.fn();
    const errorMessage =
      'Microphone access denied. Please allow microphone access.';
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(
            new DOMException('Permission denied', 'NotAllowedError'),
          ),
      },
    });

    const { result } = renderHook(() => useSpeechRecording({ onError }));

    let didStart = true;
    await act(async () => {
      didStart = await result.current.startRecording();
    });

    expect(didStart).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    expect(onError).toHaveBeenCalledWith(errorMessage);
  });

  it('stopRecording does not throw', () => {
    const { result } = renderHook(() => useSpeechRecording());
    expect(() => result.current.stopRecording()).not.toThrow();
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useSpeechRecording());
    expect(() => unmount()).not.toThrow();
  });
});
