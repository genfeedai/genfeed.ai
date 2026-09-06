import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import { afterAll, describe, expect, it, vi } from 'vitest';

class PreviewAudio extends EventTarget {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 30;
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
vi.stubGlobal(
  'Audio',
  class extends PreviewAudio {
    constructor() {
      super();
      audio = this;
    }
  },
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Pause preview for Voice' }),
    );
    expect(audio.pause).toHaveBeenCalledOnce();
    act(() => audio.dispatchEvent(new Event('error')));
    expect(screen.getByText('Preview failed')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('disables playback when no source is available', () => {
    render(<AudioPreviewPlayer label="Missing" />);
    expect(
      screen.getByRole('button', { name: 'Play preview for Missing' }),
    ).toBeDisabled();
  });
});
