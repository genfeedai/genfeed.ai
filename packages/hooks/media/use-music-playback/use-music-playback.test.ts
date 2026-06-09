import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { useMusicPlayback } from '@hooks/media/use-music-playback/use-music-playback';
import { act, renderHook } from '@testing-library/react';
import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPlay, mockStop } = vi.hoisted(() => ({
  mockPlay: vi.fn(),
  mockStop: vi.fn(),
}));

vi.mock('@hooks/media/use-audio-player/use-audio-player', () => ({
  useAudioPlayer: () => ({
    play: mockPlay,
    stop: mockStop,
  }),
}));

const timestamp = '2026-01-01T00:00:00.000Z';

const createSetAssetsMock = () =>
  vi.fn<(value: SetStateAction<IIngredient[]>) => void>();

const createMetadata = (overrides: Partial<IMetadata> = {}): IMetadata => ({
  createdAt: timestamp,
  id: 'metadata-1',
  isDeleted: false,
  label: 'Music metadata',
  updatedAt: timestamp,
  ...overrides,
});

const createIngredient = (
  overrides: Partial<IIngredient> = {},
): IIngredient => ({
  category: IngredientCategory.IMAGE,
  createdAt: timestamp,
  hasVoted: false,
  id: 'ingredient-1',
  isDefault: false,
  isDeleted: false,
  isFavorite: false,
  isHighlighted: false,
  isVoteAnimating: false,
  organization: 'organization-1',
  scope: AssetScope.USER,
  status: IngredientStatus.GENERATED,
  totalChildren: 0,
  totalVotes: 0,
  updatedAt: timestamp,
  user: 'user-1',
  ...overrides,
});

describe('useMusicPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns playback controls', () => {
    const mockSetAssets = createSetAssetsMock();
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
    const mockSetAssets = createSetAssetsMock();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    act(() => {
      result.current.stopAll();
    });

    expect(mockSetAssets).toHaveBeenCalled();
  });

  it('marks music assets without mutating the source objects', () => {
    const mockSetAssets = createSetAssetsMock();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    const assets = [
      createIngredient({
        category: IngredientCategory.MUSIC,
        id: 'music-1',
        isPlaying: false,
        metadata: createMetadata({ hasAudio: false }),
      }),
      createIngredient({
        category: IngredientCategory.IMAGE,
        id: 'image-1',
        isPlaying: false,
      }),
    ];

    const syncedAssets = result.current.syncPlaybackState(assets);

    expect(syncedAssets).toHaveLength(2);
    expect(syncedAssets[0]).not.toBe(assets[0]);
    expect(syncedAssets[0]).toMatchObject({
      hasAudio: true,
      isPlaying: false,
      metadata: { hasAudio: true },
    });
    expect(syncedAssets[1]).toBe(assets[1]);
    expect(assets[0]).toMatchObject({
      isPlaying: false,
      metadata: { hasAudio: false },
    });
  });

  it('marks the active music asset as playing when playback starts', () => {
    const mockSetAssets = createSetAssetsMock();
    const { result } = renderHook(() =>
      useMusicPlayback({ setAssets: mockSetAssets }),
    );

    const musicAsset = createIngredient({
      category: IngredientCategory.MUSIC,
      id: 'music-1',
      ingredientUrl: 'https://cdn.example.com/music.mp3',
      metadata: createMetadata(),
    });

    act(() => {
      result.current.handlePlay(musicAsset);
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith(
      'https://cdn.example.com/music.mp3',
      expect.any(Function),
    );

    const update = mockSetAssets.mock.calls[0]?.[0];
    expect(typeof update).toBe('function');
    if (typeof update !== 'function') {
      throw new Error('Expected setAssets to receive an updater function');
    }

    const updatedAssets = update([musicAsset]);
    expect(updatedAssets[0]).toMatchObject({
      hasAudio: true,
      isPlaying: true,
      metadata: { hasAudio: true },
    });
  });
});
