import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RecorderHandle {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void | Promise<void>) | null;
  state: string;
  start: () => void;
  stop: () => void;
}

const recorders: RecorderHandle[] = [];
const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];

function installMediaRecorder(): void {
  class FakeMediaRecorder implements RecorderHandle {
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void | Promise<void>) | null = null;
    state = 'inactive';

    constructor() {
      recorders.push(this);
    }

    start(): void {
      this.state = 'recording';
    }

    stop(): void {
      this.state = 'inactive';
      void this.onstop?.();
    }
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

function installGetUserMedia(
  implementation?: () => Promise<MediaStream>,
): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(
    implementation ??
      (async () => {
        const track = { stop: vi.fn() };
        tracks.push(track);
        return { getTracks: () => [track] } as unknown as MediaStream;
      }),
  );

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  return getUserMedia;
}

function renderMic(
  overrides: Partial<Parameters<typeof useMicrophoneInput>[0]> = {},
) {
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const view = renderHook(() =>
    useMicrophoneInput({
      apiBaseUrl: 'https://api.test',
      getToken: async () => 'tok',
      onError,
      onTranscript,
      ...overrides,
    }),
  );

  return { onError, onTranscript, ...view };
}

describe('useMicrophoneInput', () => {
  beforeEach(() => {
    recorders.length = 0;
    tracks.length = 0;
    installMediaRecorder();
    installGetUserMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports support when getUserMedia exists', () => {
    const { result } = renderMic();

    expect(result.current.isSupported).toBe(true);
    expect(result.current.isListening).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
  });

  it('reports no support without media devices', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    const { result } = renderMic();

    expect(result.current.isSupported).toBe(false);
  });

  it('starts listening after permission is granted', async () => {
    const { result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });

    expect(result.current.isListening).toBe(true);
    expect(recorders[0]?.state).toBe('recording');
  });

  it('reports denied microphone access', async () => {
    installGetUserMedia(async () => {
      throw new Error('denied');
    });
    const { onError, result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });

    expect(onError).toHaveBeenCalledWith('Microphone access denied');
    expect(result.current.isListening).toBe(false);
  });

  it('transcribes the recording and releases the stream on stop', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      json: async () => ({ data: { attributes: { text: 'hello world' } } }),
      ok: true,
      status: 200,
    } as unknown as Response);

    const { onTranscript, result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });
    await act(async () => {
      recorders[0]?.ondataavailable?.({ data: new Blob(['x']) });
      result.current.stopListening();
    });

    await waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith('hello world');
    });
    expect(result.current.isListening).toBe(false);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.isTranscribing).toBe(false);
    });
  });

  it('reads the flat transcript shapes too', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      json: async () => ({ text: 'flat' }),
      ok: true,
      status: 200,
    } as unknown as Response);

    const { onTranscript, result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });
    await act(async () => {
      result.current.stopListening();
    });

    await waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith('flat');
    });
  });

  it('ignores an empty transcript', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      json: async () => ({}),
      ok: true,
      status: 200,
    } as unknown as Response);

    const { onError, onTranscript, result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });
    await act(async () => {
      result.current.stopListening();
    });

    await waitFor(() => {
      expect(result.current.isTranscribing).toBe(false);
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces a failed transcription response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      json: async () => ({}),
      ok: false,
      status: 500,
    } as unknown as Response);

    const { onError, result } = renderMic();

    await act(async () => {
      result.current.startListening();
    });
    await act(async () => {
      result.current.stopListening();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Transcription failed: 500');
    });
  });

  it('stopping before starting is a no-op', () => {
    const { result } = renderMic();

    act(() => {
      result.current.stopListening();
    });

    expect(result.current.isListening).toBe(false);
  });
});
