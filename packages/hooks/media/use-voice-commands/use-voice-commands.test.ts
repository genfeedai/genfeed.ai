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

type RecognitionEventHandlers = {
  onend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
};

class MockSpeechRecognition implements RecognitionEventHandlers {
  static instances: MockSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onend: (() => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
}

describe('useVoiceCommands with a supported browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockSpeechRecognition.instances = [];
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      MockSpeechRecognition;
  });

  afterEach(() => {
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      undefined;
  });

  function latestRecognition(): MockSpeechRecognition {
    const instance = MockSpeechRecognition.instances.at(-1);
    if (!instance) {
      throw new Error('No SpeechRecognition instance created');
    }
    return instance;
  }

  it('detects support and configures the recognition instance', async () => {
    const { result } = renderHook(() =>
      useVoiceCommands({
        continuous: true,
        interimResults: true,
        language: 'fr-FR',
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isSupported).toBe(true);
    const recognition = latestRecognition();
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe('fr-FR');
  });

  it('starts and stops listening', () => {
    const { result } = renderHook(() => useVoiceCommands());
    const recognition = latestRecognition();

    let didStart = false;
    act(() => {
      didStart = result.current.start();
    });

    expect(didStart).toBe(true);
    expect(recognition.start).toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(recognition.stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('toggle flips the listening state', () => {
    const { result } = renderHook(() => useVoiceCommands());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('returns false when starting throws', () => {
    const { result } = renderHook(() => useVoiceCommands());
    const recognition = latestRecognition();
    recognition.start.mockImplementation(() => {
      throw new Error('already started');
    });

    let didStart = true;
    act(() => {
      didStart = result.current.start();
    });

    expect(didStart).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('routes transcripts to matching commands', () => {
    const commandAction = vi.fn();
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceCommands({
        commands: [
          {
            action: commandAction,
            description: 'Change model',
            pattern: /change model to (.+)/i,
          },
        ],
        onTranscript,
      }),
    );
    const recognition = latestRecognition();

    act(() => {
      recognition.onresult?.({
        results: [[{ transcript: 'change model to gpt' }]],
      });
    });

    expect(result.current.transcript).toBe('change model to gpt');
    expect(commandAction).toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('falls back to onTranscript when no command matches', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceCommands({ onTranscript }));
    const recognition = latestRecognition();

    act(() => {
      recognition.onresult?.({
        results: [[{ transcript: 'hello world' }]],
      });
    });

    expect(result.current.transcript).toBe('hello world');
    expect(onTranscript).toHaveBeenCalledWith('hello world');
  });

  it('captures recognition errors and stops listening', () => {
    const { result } = renderHook(() => useVoiceCommands());
    const recognition = latestRecognition();

    act(() => {
      result.current.start();
    });

    act(() => {
      recognition.onerror?.({ error: 'network', message: 'offline' });
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toEqual({
      error: 'network',
      message: 'offline',
    });

    act(() => {
      recognition.onerror?.({ error: 'not-allowed' });
    });
    expect(result.current.error?.error).toBe('not-allowed');

    act(() => {
      recognition.onerror?.({ error: 'no-speech' });
    });
    expect(result.current.error?.error).toBe('no-speech');
  });

  it('stops listening when recognition ends on its own', () => {
    const { result } = renderHook(() => useVoiceCommands());
    const recognition = latestRecognition();

    act(() => {
      result.current.start();
    });
    act(() => {
      recognition.onend?.();
    });

    expect(result.current.isListening).toBe(false);
  });

  it('stops recognition on unmount', () => {
    const { unmount } = renderHook(() => useVoiceCommands());
    const recognition = latestRecognition();

    unmount();

    expect(recognition.stop).toHaveBeenCalled();
  });
});
