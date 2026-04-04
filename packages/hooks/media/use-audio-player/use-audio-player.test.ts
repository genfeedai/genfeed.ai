import { useAudioPlayer } from '@hooks/media/use-audio-player/use-audio-player';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createdAudios: MockAudio[] = [];

class MockAudio {
  public onended: (() => void) | null = null;
  public currentTime = 0;
  public play = vi.fn();
  public pause = vi.fn();

  constructor(public src: string) {
    createdAudios.push(this);
  }
}

describe('useAudioPlayer', () => {
  beforeEach(() => {
    createdAudios.length = 0;
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('plays audio when url is provided', () => {
    const { result } = renderHook(() => useAudioPlayer());
    result.current.play('https://example.com/audio.mp3');

    expect(createdAudios).toHaveLength(1);
    expect(createdAudios[0].src).toBe('https://example.com/audio.mp3');
    expect(createdAudios[0].play).toHaveBeenCalled();
  });

  it('does nothing when url is empty', () => {
    const { result } = renderHook(() => useAudioPlayer());
    result.current.play('');

    expect(createdAudios).toHaveLength(0);
  });

  it('stops previous audio before playing a new one', () => {
    const { result } = renderHook(() => useAudioPlayer());
    result.current.play('https://example.com/audio-1.mp3');
    result.current.play('https://example.com/audio-2.mp3');

    expect(createdAudios).toHaveLength(2);
    expect(createdAudios[0].pause).toHaveBeenCalled();
    expect(createdAudios[0].currentTime).toBe(0);
    expect(createdAudios[1].play).toHaveBeenCalled();
  });

  it('stops audio when stop is called', () => {
    const { result } = renderHook(() => useAudioPlayer());
    result.current.play('https://example.com/audio.mp3');
    result.current.stop();

    expect(createdAudios[0].pause).toHaveBeenCalled();
    expect(createdAudios[0].currentTime).toBe(0);
  });

  it('invokes onEnded callback when audio ends', () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() => useAudioPlayer());
    result.current.play('https://example.com/audio.mp3', onEnded);

    createdAudios[0].onended?.();

    expect(onEnded).toHaveBeenCalled();
  });
});
