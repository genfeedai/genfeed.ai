'use client';

import { IngredientCategory } from '@genfeedai/contracts';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import {
  getIngredientModelLabel,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import { getIngredientDisplayLabel } from '@genfeedai/utils/media/ingredient-type.util';
import { getLibraryAssetTypeLabel } from '@genfeedai/utils/media/library-asset-type.util';
import MediaPlayer from '@ui/media-player/MediaPlayer';
import { Badge } from '@ui/primitives/badge';
import { Mic, Music } from 'lucide-react';
import type { IngredientTileProps } from '@/props/content/ingredient.props';
import IngredientTileFrame from './IngredientTileFrame';
import {
  isIngredientPlayable,
  TYPE_BADGE_CLASS,
} from './ingredient-tile-kind.util';

/**
 * A Library audio or voice asset as a waveform tile. Playback goes through
 * the shared `MediaPlayer`, so one clip plays at a time across the grid.
 */
export default function IngredientAudioTile(props: IngredientTileProps) {
  const { ingredient } = props;
  const grant = useAuthorizedMediaPreview(ingredient);
  const label = getIngredientDisplayLabel(ingredient) || 'Untitled asset';
  const isVoice = ingredient.category === IngredientCategory.VOICE;
  const BadgeIcon = isVoice ? Mic : Music;
  // A PROCESSING or FAILED row still resolves `ingredientUrl` to a placeholder
  // image, so readiness comes from status and never from the URL alone.
  const src = isIngredientPlayable(ingredient)
    ? grant
      ? (grant.url ?? undefined)
      : ingredient.ingredientUrl
    : undefined;
  const metadata =
    typeof ingredient.metadata === 'object' ? ingredient.metadata : undefined;

  return (
    <IngredientTileFrame {...props}>
      <MediaPlayer
        badge={
          // The selection toggle takes this corner on hover and when selected.
          <span className={TYPE_BADGE_CLASS}>
            <Badge
              icon={<BadgeIcon aria-hidden="true" className="size-3" />}
              variant="secondary"
            >
              {getLibraryAssetTypeLabel(ingredient.category) ?? 'Audio'}
            </Badge>
          </span>
        }
        // The bottom strip stays clear for the hover layer: tags, origin, review.
        className="w-full pb-10"
        knownDuration={ingredient.metadataDuration ?? metadata?.duration ?? 0}
        label={label}
        meta={getIngredientModelLabel(ingredient) ?? undefined}
        src={src}
        stopOnUnmount
        title={label}
        variant="tile"
      />
    </IngredientTileFrame>
  );
}
