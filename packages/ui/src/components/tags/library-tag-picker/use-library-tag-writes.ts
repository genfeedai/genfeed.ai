'use client';

import { TagBulkAction } from '@genfeedai/contracts';
import type { IBulkTagResult, ITag } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { dispatchLibraryAssetTagsChange } from './library-asset-tags-event';
import { LIBRARY_TAGS_QUERY_KEY } from './library-tags-query-key';

export interface LibraryTagWriteOutcome {
  /** Assets whose tags actually changed. */
  changedIds: string[];
  result: IBulkTagResult;
}

/**
 * Add or remove one tag on assets and tell the Library list, so cards and the
 * inspector update in place. One asset and a whole selection take the same
 * path: the bulk endpoint with a list of one or up to 200 ids.
 */
export function useLibraryTagWrites() {
  const translate = useTranslations('pages.library.tags');
  const queryClient = useQueryClient();
  const [isWriting, setIsWriting] = useState(false);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const applyTag = useCallback(
    async (
      action: TagBulkAction,
      tag: ITag,
      ingredientIds: string[],
    ): Promise<LibraryTagWriteOutcome | null> => {
      setIsWriting(true);
      try {
        const service = await getIngredientsService();
        const result = await service.bulkTag({
          action,
          ids: ingredientIds,
          tagId: tag.id,
        });

        const unchangedIds = new Set([
          ...(result.skippedIds ?? []),
          ...(result.failedIds ?? []),
        ]);
        const changedIds = ingredientIds.filter((id) => !unchangedIds.has(id));

        dispatchLibraryAssetTagsChange({
          action,
          ingredientIds: changedIds,
          tag,
        });
        // Asset counts in the picker and the filter follow the write.
        void queryClient.invalidateQueries({
          queryKey: [LIBRARY_TAGS_QUERY_KEY],
        });

        const notifications = NotificationsService.getInstance();
        if (result.failed > 0) {
          notifications.error(
            translate('bulkFailed', {
              changed: result.changed,
              failed: result.failed,
              skipped: result.skipped,
            }),
          );
        } else if (ingredientIds.length === 1 && result.skipped > 0) {
          // A single asset that is already tagged is not a problem; one the
          // member cannot edit is.
          notifications.success(
            translate(
              action === TagBulkAction.ADD ? 'alreadyTagged' : 'notTagged',
              { label: tag.label },
            ),
          );
        } else {
          notifications.success(
            translate(
              action === TagBulkAction.ADD ? 'bulkAdded' : 'bulkRemoved',
              {
                changed: result.changed,
                label: tag.label,
                skipped: result.skipped,
              },
            ),
          );
        }

        return { changedIds, result };
      } catch (error: unknown) {
        logger.error('Failed to update Library tags', error);
        NotificationsService.getInstance().error(translate('writeFailed'));
        return null;
      } finally {
        setIsWriting(false);
      }
    },
    [getIngredientsService, queryClient, translate],
  );

  return { applyTag, isWriting };
}
