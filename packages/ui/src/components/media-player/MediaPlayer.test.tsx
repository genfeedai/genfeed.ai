import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import MediaPlayer from '@ui/media-player/MediaPlayer';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

class PreviewAudio extends EventTarget {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 30;
  volume = 1;
  muted = false;
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

describe('MediaPlayer', () => {
  it('shares playback, seeks, and reports load failures without native controls', async () => {
    const onError = vi.fn();
    render(
      <MediaPlayer
        src="https://cdn.test/voice.mp3"
        label="Voice"
        variant="inspector"
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
    expect(audio.currentTime).toBe(5);
    expect(screen.getByText('0:00 / 0:30')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mute preview for Voice' }),
    );
    expect(audio.muted).toBe(true);
    act(() => audio.dispatchEvent(new Event('volumechange')));
    fireEvent.click(
      screen.getByRole('button', { name: 'Unmute preview for Voice' }),
    );
    expect(audio.muted).toBe(false);
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
      <MediaPlayer src="/preview.mp3" label="Relative" stopOnUnmount />,
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
    render(<MediaPlayer label="Missing" />);
    expect(
      screen.getByRole('button', { name: 'Play preview for Missing' }),
    ).toBeDisabled();
  });

  it('starts playback instead of seeking when the waveform of an idle clip is pressed', async () => {
    render(
      <MediaPlayer
        knownDuration={34}
        label="Idle"
        src="https://cdn.test/idle.mp3"
        variant="row"
      />,
    );
    expect(screen.getByText('0:00 / 0:34')).toBeInTheDocument();
    const positionBefore = audio.currentTime;
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Seek Idle' }), {
      key: 'ArrowRight',
    });
    await waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    expect(audio.currentTime).toBe(positionBefore);
  });

  it('shows the tile caption with its badge and keeps the same controls', () => {
    render(
      <MediaPlayer
        badge={<span>Voice</span>}
        knownDuration={24}
        label="Brand intro"
        meta="Rachel · en"
        src="https://cdn.test/intro.mp3"
        title="Warm narration for the brand intro"
        variant="tile"
      />,
    );
    expect(screen.getByText('Voice')).toBeInTheDocument();
    expect(
      screen.getByText('Warm narration for the brand intro'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rachel · en')).toBeInTheDocument();
    expect(screen.getByText('0:00 / 0:24')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play preview for Brand intro' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('slider', { name: 'Seek Brand intro' }),
    ).toBeInTheDocument();
  });

  it('renders only the play button for the button variant', () => {
    render(<MediaPlayer label="Pick" src="https://cdn.test/pick.mp3" />);
    expect(
      screen.getByRole('button', { name: 'Play preview for Pick' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
