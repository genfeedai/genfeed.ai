'use client';

import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { Play } from 'lucide-react';
import Image from 'next/image';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';
import type { PublishingContentMediaPreviewProps } from '@/features/posts/props/publishing-content-entry.props';

const CARD_MEDIA_SIZES = '(min-width: 768px) 320px, 100vw';

/**
 * A post's first image or video, shown across the top of a board or grid
 * card so the card reads as the post itself.
 */
export default function PublishingContentMediaPreview({
  media,
}: PublishingContentMediaPreviewProps) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-tertiary">
      {'ingredient' in media ? (
        <IngredientThumbnail
          alt=""
          className="object-cover"
          ingredient={media.ingredient}
          sizes={CARD_MEDIA_SIZES}
        />
      ) : (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes={CARD_MEDIA_SIZES}
          src={media.url}
          unoptimized={!canOptimizeImageSource(media.url)}
        />
      )}
      {media.isVideo ? (
        <span
          className={
            'absolute bottom-2 left-2 flex size-6 items-center justify-center rounded-full bg-black/60' /* design-system-allow-content-color -- play mark over media */
          }
        >
          <Play
            aria-hidden="true"
            className={
              'size-3.5 fill-white text-white' /* design-system-allow-content-color -- play mark over media */
            }
          />
        </span>
      ) : null}
    </div>
  );
}
