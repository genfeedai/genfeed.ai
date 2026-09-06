import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

class PreviewAudio extends EventTarget {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 30;
  volume = 1;
  paused = true;
  ended = false;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
}
let audio = new PreviewAudio();
beforeEach(() =>
  vi.stubGlobal(
    'Audio',
    class extends PreviewAudio {
      constructor() {
        super();
        audio = this;
      }
    },
  ),
);
afterAll(() => vi.unstubAllGlobals());

describe('AudioPreviewPlayer', () => {
  it('shares playback, seeks, and reports load failures without native controls', async () => {
    const onError = vi.fn();
    render(
      <AudioPreviewPlayer
        audioUrl="https://cdn.test/voice.mp3"
        label="Voice"
        isTimelineVisible
        onError={onError}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Play preview for Voice' }),
    );
    await waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    act(() => audio.dispatchEvent(new Event('loadedmetadata')));
    const slider = screen.getByRole('slider', { name: 'Seek Voice' });
    expect(slider).toHaveAttribute('aria-valuemax', '30');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(audio.currentTime).toBeGreaterThan(0);
    fireEvent.keyDown(
      screen.getByRole('slider', { name: 'Volume for Voice' }),
      { key: 'ArrowLeft' },
    );
    expect(audio.volume).toBeLessThan(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pause preview for Voice' }),
    );
    expect(audio.pause).toHaveBeenCalledOnce();
    act(() => audio.dispatchEvent(new Event('error')));
    expect(screen.getByText('Preview failed')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('resumes relative sources and stops modal playback on unmount', async () => {
    const { unmount } = render(
      <AudioPreviewPlayer
        audioUrl="/preview.mp3"
        label="Relative"
        stopOnUnmount
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Play preview for Relative' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pause preview for Relative' }),
      ).toBeInTheDocument(),
    );
    unmount();
    expect(audio.paused).toBe(true);
  });

  it('disables playback when no source is available', () => {
    render(<AudioPreviewPlayer label="Missing" />);
    expect(
      screen.getByRole('button', { name: 'Play preview for Missing' }),
    ).toBeDisabled();
  });
});
