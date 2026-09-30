import { useAudioRecording } from '@hooks/media/use-audio-recording/use-audio-recording';
import { useSpeechRecording } from '@hooks/media/use-speech-recording/use-speech-recording';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  getUserMedia: vi.fn(),
}));
vi.mock('@genfeedai/services/ai/speech.service', () => ({
  SpeechService: { isFileSizeValid: () => true },
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ transcribeAudio: mocks.transcribe }),
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

class Recorder {
  static instances: Recorder[] = [];
  static failure: 'construct' | 'start' | null = null;
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    if (Recorder.failure === 'construct')
      throw new Error('construction failed');
    Recorder.instances.push(this);
  }
  start() {
    if (Recorder.failure === 'start') throw new Error('start failed');
  }
  stop() {
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}
function stream() {
  const stop = vi.fn();
  return {
    stop,
    value: { getTracks: () => [{ stop }] } as unknown as MediaStream,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Recorder.instances = [];
  Recorder.failure = null;
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mocks.getUserMedia },
  });
});
afterEach(() => vi.unstubAllGlobals());

for (const [name, useRecording] of [
  ['audio', useAudioRecording],
  ['speech', useSpeechRecording],
] as const) {
  describe(`${name} recording ownership`, () => {
    it('releases permission granted after unmount without starting a recorder', async () => {
      const permission = Promise.withResolvers<MediaStream>();
      const late = stream();
      mocks.getUserMedia.mockReturnValueOnce(permission.promise);
      const { result, unmount } = renderHook(() => useRecording());
      let start: Promise<boolean>;
      act(() => {
        start = result.current.startRecording();
      });
      unmount();
      await act(async () => {
        permission.resolve(late.value);
        expect(await start).toBe(false);
      });
      expect(late.stop).toHaveBeenCalledTimes(1);
      expect(Recorder.instances).toHaveLength(0);
    });

    it('only starts the newest overlapping permission request', async () => {
      const first = Promise.withResolvers<MediaStream>();
      const oldStream = stream();
      const currentStream = stream();
      mocks.getUserMedia
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(currentStream.value);
      const { result, unmount } = renderHook(() => useRecording());
      let oldStart: Promise<boolean>;
      act(() => {
        oldStart = result.current.startRecording();
      });
      await act(async () => {
        expect(await result.current.startRecording()).toBe(true);
      });
      await act(async () => {
        first.resolve(oldStream.value);
        expect(await oldStart).toBe(false);
      });
      expect(oldStream.stop).toHaveBeenCalledTimes(1);
      expect(currentStream.stop).not.toHaveBeenCalled();
      expect(Recorder.instances).toHaveLength(1);
      expect(result.current.isRecording).toBe(true);
      unmount();
      expect(currentStream.stop).toHaveBeenCalledTimes(1);
    });

    it.each(['construct', 'start'] as const)(
      'releases the microphone after recorder %s failure',
      async (failure) => {
        Recorder.failure = failure;
        const microphone = stream();
        mocks.getUserMedia.mockResolvedValueOnce(microphone.value);
        const onError = vi.fn();
        const { result } = renderHook(() => useRecording({ onError }));
        await act(async () => {
          expect(await result.current.startRecording()).toBe(false);
        });
        expect(microphone.stop).toHaveBeenCalledTimes(1);
        expect(result.current.isRecording).toBe(false);
        expect(onError).toHaveBeenCalledTimes(1);
      },
    );
  });
}

it('stops speech capture before transcription and ignores its result after unmount', async () => {
  const microphone = stream();
  mocks.getUserMedia.mockResolvedValueOnce(microphone.value);
  const transcription = Promise.withResolvers<{ text: string }>();
  mocks.transcribe.mockReturnValueOnce(transcription.promise);
  const onTranscription = vi.fn();
  const { result, unmount } = renderHook(() =>
    useSpeechRecording({ onTranscription }),
  );
  await act(async () => {
    await result.current.startRecording();
  });
  await act(async () => {
    result.current.stopRecording();
  });
  expect(microphone.stop).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => {
    transcription.resolve({ text: 'late' });
    await transcription.promise;
  });
  expect(onTranscription).not.toHaveBeenCalled();
});
