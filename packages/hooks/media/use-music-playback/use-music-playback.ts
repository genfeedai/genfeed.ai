import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { useAudioPlayer } from '@hooks/media/use-audio-player/use-audio-player';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef } from 'react';

export interface UseMusicPlaybackOptions {
  setAssets: Dispatch<SetStateAction<IIngredient[]>>;
}

type MusicPlaybackIngredient = IIngredient & { hasAudio: true };

const isMetadata = (metadata: IIngredient['metadata']): metadata is IMetadata =>
  typeof metadata === 'object' && metadata !== null;

const markMusicAsset = (
  asset: IIngredient,
  isPlaying: boolean,
): MusicPlaybackIngredient => {
  const metadata = isMetadata(asset.metadata)
    ? { ...asset.metadata, hasAudio: true }
    : asset.metadata;

  return {
    ...asset,
    hasAudio: true,
    isPlaying,
    metadata,
  };
};

const markPlayingState = (
  assets: IIngredient[],
  activeId: string | null,
): IIngredient[] =>
  assets.map((asset) => {
    if (asset.category !== IngredientCategory.MUSIC) {
      return asset;
    }

    return markMusicAsset(asset, Boolean(activeId && asset.id === activeId));
  });

export function useMusicPlayback({ setAssets }: UseMusicPlaybackOptions) {
  const { play, stop } = useAudioPlayer();
  const playingIdRef = useRef<string | null>(null);

  const stopAll = useCallback(() => {
    stop();
    playingIdRef.current = null;

    setAssets((prev) => markPlayingState(prev, null));
  }, [setAssets, stop]);

  const handlePlay = useCallback(
    (item: IIngredient) => {
      if (item.category !== IngredientCategory.MUSIC || !item.ingredientUrl) {
        return;
      }

      const assetId = item.id as string | undefined;
      if (!assetId) {
        return;
      }

      const isSameAsset = playingIdRef.current === assetId;

      // Always stop any currently playing audio and reset flags
      stop();

      if (isSameAsset) {
        playingIdRef.current = null;
        return setAssets((prev) => markPlayingState(prev, null));
      }

      playingIdRef.current = assetId;

      play(item.ingredientUrl, () => {
        playingIdRef.current = null;
        setAssets((prev) => markPlayingState(prev, null));
      });

      setAssets((prev) => markPlayingState(prev, assetId));
    },
    [play, setAssets, stop],
  );

  const syncPlaybackState = useCallback(
    (assets: IIngredient[]) => {
      if (!playingIdRef.current) {
        return markPlayingState(assets, null);
      }

      const hasActiveAsset = assets.some(
        (asset) =>
          asset.category === IngredientCategory.MUSIC &&
          asset.id === playingIdRef.current,
      );

      if (!hasActiveAsset) {
        playingIdRef.current = null;
        stop();
        return markPlayingState(assets, null);
      }

      return markPlayingState(assets, playingIdRef.current);
    },
    [stop],
  );

  return {
    handlePlay,
    stopAll,
    syncPlaybackState,
  };
}
