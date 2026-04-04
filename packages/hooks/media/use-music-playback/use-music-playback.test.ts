import { useMusicPlayback } from '@hooks/media/use-music-playback/use-music-playback';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useAudioPlayer
vi.mock('@hooks/media/use-audio-player/use-audio-player', () => ({
  useAudioPlayer: () => ({
    play: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('useMusicPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns playback controls', () => {
    const mockSetAssets = vi.fn();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    expect(result.current).toHaveProperty('handlePlay');
    expect(result.current).toHaveProperty('stopAll');
    expect(result.current).toHaveProperty('syncPlaybackState');
    expect(typeof result.current.handlePlay).toBe('function');
    expect(typeof result.current.stopAll).toBe('function');
    expect(typeof result.current.syncPlaybackState).toBe('function');
  });

  it('stopAll should call setAssets', () => {
    const mockSetAssets = vi.fn();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    act(() => {
      result.current.stopAll();
    });

    expect(mockSetAssets).toHaveBeenCalled();
  });

  it('syncPlaybackState should return marked assets', () => {
    const mockSetAssets = vi.fn();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    const assets = [
      { category: 'music', id: '1', isPlaying: false },
      { category: 'image', id: '2', isPlaying: false },
    ];

    const syncedAssets = result.current.syncPlaybackState(assets as any);
    expect(syncedAssets).toHaveLength(2);
  });
});
