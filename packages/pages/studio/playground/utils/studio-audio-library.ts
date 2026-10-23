import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import {
  buildStudioGalleryQuery,
  STUDIO_GALLERY_PAGE_SIZE,
} from '@pages/studio/playground/utils/studio-playground-gallery';
import { studioIngredientAccessibleLabel } from '@pages/studio/playground/utils/studio-playground-recipe';
import type { IngredientsService } from '@services/content/ingredients.service';

const AUDIO_CATEGORIES = [
  IngredientCategory.AUDIO,
  IngredientCategory.VOICE,
  IngredientCategory.MUSIC,
];
const READY_STATUSES = new Set([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

/** Bounded ingredient reads: mention/post identities are never audio reference IDs. */
export async function loadStudioAudioLibrary(
  service: Pick<IngredientsService, 'findAllPage'>,
  brandId: string,
  organizationId: string,
  signal: AbortSignal,
): Promise<AgentContentMentionItem[]> {
  if (!brandId || !organizationId) return [];
  signal.throwIfAborted();
  const pages = await Promise.all(
    AUDIO_CATEGORIES.map((category) =>
      service.findAllPage(
        {
          ...buildStudioGalleryQuery(
            brandId,
            'all',
            STUDIO_GALLERY_PAGE_SIZE,
            category,
          ),
          page: 1,
        },
        signal,
        { handledErrorStatuses: [408, 429, 500, 502, 503, 504] },
      ),
    ),
  );
  signal.throwIfAborted();
  const items = new Map<string, AgentContentMentionItem>();
  for (const page of pages) {
    for (const asset of page.items.slice(0, STUDIO_GALLERY_PAGE_SIZE)) {
      if (
        !asset.id ||
        asset.brandId !== brandId ||
        asset.isDeleted ||
        (asset.organizationId && asset.organizationId !== organizationId) ||
        !AUDIO_CATEGORIES.includes(asset.category) ||
        !READY_STATUSES.has(asset.status) ||
        !asset.s3Key
      )
        continue;
      if (!items.has(asset.id))
        items.set(asset.id, {
          brandId,
          contentTitle: studioIngredientAccessibleLabel(asset),
          contentType: String(asset.category),
          id: asset.id,
        });
    }
  }
  return [...items.values()];
}
