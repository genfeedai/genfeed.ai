'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { Editor } from '@tiptap/react';
import { Button } from '@ui/primitives/button';
import { ImagePlus, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GenfeedGenerationKind } from './extensions/genfeed-generation.extension';

const KINDS: ReadonlyArray<{
  category: IngredientCategory;
  icon: typeof ImagePlus;
  kind: GenfeedGenerationKind;
  labelKey: 'insertImage' | 'insertVideo';
}> = [
  {
    category: IngredientCategory.IMAGE,
    icon: ImagePlus,
    kind: 'image',
    labelKey: 'insertImage',
  },
  {
    category: IngredientCategory.VIDEO,
    icon: Video,
    kind: 'video',
    labelKey: 'insertVideo',
  },
];

/**
 * Embeds library generations into the article as blocks. Readers only see a
 * block whose asset is public, so a private pick is flagged at once.
 */
export default function GenerationInsertButton({
  editor,
}: {
  editor: Editor;
}): React.ReactElement {
  const { openGallery } = useGalleryModal();
  const t = useTranslations('ui.articleGenerationBlock');

  return (
    <>
      {KINDS.map(({ category, icon: Icon, kind, labelKey }) => (
        <Button
          ariaLabel={t(labelKey)}
          key={kind}
          onClick={() =>
            openGallery({
              category,
              onSelect: (items) => {
                for (const item of items) {
                  editor
                    .chain()
                    .focus()
                    .insertGenfeedGeneration({
                      ingredientId: item.id,
                      isPromptShown: true,
                      kind,
                    })
                    .run();
                }
                if (items.some((item) => !isPublicAssetScope(item.scope))) {
                  NotificationsService.getInstance().warning(
                    t('privateAssetWarning'),
                  );
                }
              },
              title: t(labelKey),
            })
          }
          title={t(labelKey)}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      ))}
    </>
  );
}
