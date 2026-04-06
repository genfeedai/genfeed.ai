import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useAudioPlayer } from '@hooks/media/use-audio-player/use-audio-player';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef } from 'react';

export interface UseMusicPlaybackOptions {
  setAssets: Dispatch<SetStateAction<IIngredient[]>>;
}

const ensureMusicMetadata = (asset: IIngredient) => {
  if (asset.category !== IngredientCategory.MUSIC) {
    return asset;
  }

  if (typeof asset.metadata === 'object' && asset.metadata !== null) {
    (asset.metadata as unknown as Record<string, unknown>).hasAudio = true;
  }

  (asset as IIngredient & { hasAudio?: boolean }).hasAudio = true;

  return asset;
};

const markPlayingState = (
  assets: IIngredient[],
  activeId: string | null,
): IIngredient[] =>
  assets.map((asset) => {
    if (asset.category !== IngredientCategory.MUSIC) {
      return asset;
    }

    const normalized = ensureMusicMetadata(asset);

    normalized.isPlaying = Boolean(activeId && normalized.id === activeId);

    return normalized;
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
