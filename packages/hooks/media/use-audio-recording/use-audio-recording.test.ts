import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useAudioRecording } from './use-audio-recording';

interface RecorderDataEvent {
  data: Blob;
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static supportedTypes: string[] = ['audio/webm;codecs=opus'];

  static isTypeSupported(type: string): boolean {
    return MockMediaRecorder.supportedTypes.includes(type);
  }

  readonly mimeType: string;
  ondataavailable: ((event: RecorderDataEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onstop?.();
  });

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
    MockMediaRecorder.instances.push(this);
  }
}

function createMockStream(): { stream: MediaStream; stopTrack: () => void } {
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  return { stopTrack, stream };
}

describe('useAudioRecording', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    MockMediaRecorder.instances = [];
    MockMediaRecorder.supportedTypes = ['audio/webm;codecs=opus'];
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects support and starts idle', async () => {
    const { result } = renderHook(() => useAudioRecording());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordedFile).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('starts recording with the first supported mime type', async () => {
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecording());

    let didStart = false;
    await act(async () => {
      didStart = await result.current.startRecording();
    });

    expect(didStart).toBe(true);
    expect(result.current.isRecording).toBe(true);
    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(MockMediaRecorder.instances[0].mimeType).toBe(
      'audio/webm;codecs=opus',
    );
    expect(MockMediaRecorder.instances[0].start).toHaveBeenCalled();
  });

  it('prefers the caller-provided mime type when supported', async () => {
    MockMediaRecorder.supportedTypes = ['audio/mp4'];
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() =>
      useAudioRecording({ preferredMimeType: 'audio/mp4' }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(MockMediaRecorder.instances[0].mimeType).toBe('audio/mp4');
  });

  it('produces a recorded file when recording stops', async () => {
    const { stopTrack, stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = MockMediaRecorder.instances[0];

    act(() => {
      recorder.ondataavailable?.({
        data: new Blob(['audio-bytes'], { type: 'audio/webm;codecs=opus' }),
      });
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordedFile).not.toBeNull();
    expect(result.current.recordedFile?.name).toBe('voice-sample.webm');
    expect(stopTrack).toHaveBeenCalled();
  });

  it('names mp4 recordings with an m4a extension', async () => {
    MockMediaRecorder.supportedTypes = ['audio/mp4'];
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = MockMediaRecorder.instances[0];

    act(() => {
      recorder.ondataavailable?.({
        data: new Blob(['audio-bytes'], { type: 'audio/mp4' }),
      });
      result.current.stopRecording();
    });

    expect(result.current.recordedFile?.name).toBe('voice-sample.m4a');
  });

  it('ignores empty data chunks and reports an empty recording', async () => {
    const onError = vi.fn();
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecording({ onError }));

    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = MockMediaRecorder.instances[0];

    act(() => {
      recorder.ondataavailable?.({ data: new Blob([]) });
      result.current.stopRecording();
    });

    expect(result.current.recordedFile).toBeNull();
    expect(result.current.error).toBe('Recording failed. Please try again.');
    expect(onError).toHaveBeenCalledWith('Recording failed. Please try again.');
  });

  it('maps microphone permission denial to a friendly message', async () => {
    const onError = vi.fn();
    getUserMedia.mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );

    const { result } = renderHook(() => useAudioRecording({ onError }));

    let didStart = true;
    await act(async () => {
      didStart = await result.current.startRecording();
    });

    expect(didStart).toBe(false);
    expect(result.current.error).toBe(
      'Microphone access denied. Please allow microphone access.',
    );
    expect(onError).toHaveBeenCalled();
  });

  it('maps a missing microphone to a friendly message', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'));

    const { result } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(
      'No microphone found. Please connect a microphone.',
    );
  });

  it('uses a generic message for unknown errors', async () => {
    getUserMedia.mockRejectedValue(new Error('unknown'));

    const { result } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Failed to start recording.');
  });

  it('clears the recorded file on demand', async () => {
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = MockMediaRecorder.instances[0];

    act(() => {
      recorder.ondataavailable?.({
        data: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      });
      result.current.stopRecording();
    });

    expect(result.current.recordedFile).not.toBeNull();

    act(() => {
      result.current.clearRecordedFile();
    });

    expect(result.current.recordedFile).toBeNull();
  });

  it('stops stream tracks on unmount', async () => {
    const { stopTrack, stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);

    const { result, unmount } = renderHook(() => useAudioRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    unmount();

    expect(stopTrack).toHaveBeenCalled();
  });
});
