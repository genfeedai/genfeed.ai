// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AvatarTwinRecorder from '@/features/avatar-twins/avatar-twin-recorder';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

/** A browser recorder that hands back one small chunk on stop. */
class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'video/webm';
  mimeType = 'video/webm';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob([new Uint8Array(1024)]),
    });
    this.onstop?.();
  }
}

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

async function recordFor(seconds: number) {
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(seconds * 1000);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
}

describe('AvatarTwinRecorder', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onSubmit.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => fakeStream()) },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      set: () => undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderRecorder() {
    render(
      <AvatarTwinRecorder
        onSubmit={onSubmit}
        submitPhase={null}
        uploadProgress={0}
      />,
    );
  }

  it('refuses a take under 15 seconds', async () => {
    renderRecorder();

    await recordFor(5);

    expect(
      screen.getByText('This take is shorter than 15 seconds. Record again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use this take' }),
    ).toBeDisabled();
  });

  it('submits a take long enough to train on', async () => {
    renderRecorder();

    await recordFor(30);
    fireEvent.click(screen.getByRole('button', { name: 'Use this take' }));

    const [file, isRecordingKept] = onSubmit.mock.calls[0] ?? [];
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ type: 'video/webm' });
    expect(isRecordingKept).toBe(false);
  });

  it('deletes the recording after training unless the person keeps a copy', async () => {
    renderRecorder();

    await recordFor(30);
    expect(
      screen.getByText(/we delete the recording as soon as HeyGen has it/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Keep a copy of this recording in my Library',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use this take' }));

    expect(onSubmit.mock.calls[0]?.[1]).toBe(true);
  });

  it('starts over on a retake', async () => {
    renderRecorder();

    await recordFor(30);
    fireEvent.click(screen.getByRole('button', { name: 'Record again' }));

    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeInTheDocument();
  });

  it('explains a blocked camera', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException('denied', 'NotAllowedError');
        }),
      },
    });
    renderRecorder();

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Camera or microphone access was blocked/),
    ).toBeInTheDocument();
  });
});
