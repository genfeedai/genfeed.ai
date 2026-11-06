import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioRecording } from '@/hooks/media/use-audio-recording/use-audio-recording';
import { useSpeechRecording } from '@/hooks/media/use-speech-recording/use-speech-recording';

// Fake media devices and speech API. `grants` queues what each microphone
// permission request resolves to; `transcriptions` holds the pending
// transcription requests in arrival order.
const devices = vi.hoisted(() => ({
  grants: [] as Promise<MediaStream>[],
  transcriptions: [] as Promise<{ text: string }>[],
  transcriptionResults: [] as Promise<{ text: string }>[],
}));
vi.mock('@genfeedai/services/ai/speech.service', () => ({
  SpeechService: { isFileSizeValid: () => true },
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    transcribeAudio: () => {
      const next =
        devices.transcriptionResults.shift() ?? Promise.resolve({ text: '' });
      devices.transcriptions.push(next);
      return next;
    },
  }),
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
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
/** A microphone stream whose single track ends once stopped, like a real one. */
function stream() {
  const track = {
    readyState: 'live' as 'ended' | 'live',
    stop: () => {
      track.readyState = 'ended';
    },
  };
  return {
    track,
    value: { getTracks: () => [track] } as unknown as MediaStream,
  };
}

beforeEach(() => {
  devices.grants = [];
  devices.transcriptions = [];
  devices.transcriptionResults = [];
  Recorder.instances = [];
  Recorder.failure = null;
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () =>
        devices.grants.shift() ??
        Promise.reject(new Error('Permission denied')),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['audio', useAudioRecording],
  ['speech', useSpeechRecording],
] as const)('%s recording ownership', (_name, useRecording) => {
  it('releases permission granted after unmount without starting a recorder', async () => {
    const permission = Promise.withResolvers<MediaStream>();
    const late = stream();
    devices.grants.push(permission.promise);
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
    expect(late.track.readyState).toBe('ended');
    expect(Recorder.instances).toHaveLength(0);
  });

  it('only starts the newest overlapping permission request', async () => {
    const first = Promise.withResolvers<MediaStream>();
    const oldStream = stream();
    const currentStream = stream();
    devices.grants.push(first.promise, Promise.resolve(currentStream.value));
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
    expect(oldStream.track.readyState).toBe('ended');
    expect(currentStream.track.readyState).toBe('live');
    expect(Recorder.instances).toHaveLength(1);
    expect(result.current.isRecording).toBe(true);
    unmount();
    expect(currentStream.track.readyState).toBe('ended');
  });

  it.each(['construct', 'start'] as const)(
    'releases the microphone after recorder %s failure',
    async (failure) => {
      Recorder.failure = failure;
      const microphone = stream();
      devices.grants.push(Promise.resolve(microphone.value));
      const errors: unknown[] = [];
      const { result } = renderHook(() =>
        useRecording({ onError: (error: unknown) => errors.push(error) }),
      );
      await act(async () => {
        expect(await result.current.startRecording()).toBe(false);
      });
      expect(microphone.track.readyState).toBe('ended');
      expect(result.current.isRecording).toBe(false);
      expect(errors).toHaveLength(1);
    },
  );
});

it('stops speech capture before transcription and ignores its result after unmount', async () => {
  const microphone = stream();
  devices.grants.push(Promise.resolve(microphone.value));
  const transcription = Promise.withResolvers<{ text: string }>();
  devices.transcriptionResults.push(transcription.promise);
  const received: unknown[] = [];
  const { result, unmount } = renderHook(() =>
    useSpeechRecording({
      onTranscription: (result) => {
        received.push(result);
      },
    }),
  );
  await act(async () => {
    await result.current.startRecording();
  });
  await act(async () => {
    result.current.stopRecording();
  });
  expect(microphone.track.readyState).toBe('ended');
  expect(devices.transcriptions).toHaveLength(1);
  unmount();
  await act(async () => {
    transcription.resolve({ text: 'late' });
    await transcription.promise;
  });
  expect(received).toEqual([]);
});
