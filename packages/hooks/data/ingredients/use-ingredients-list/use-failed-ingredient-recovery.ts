'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AgentStudioHandoffPayload,
  IImage,
  IIngredient,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { UseFailedIngredientRecoveryProps } from '@genfeedai/props/content/ingredient-recovery.props';
import { AgentStudioHandoffService } from '@genfeedai/services/content/agent-studio-handoff.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import {
  getIngredientModelLabel,
  getIngredientPromptText,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import { getIngredientRecovery } from '@genfeedai/utils/media/ingredient-recovery.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

function referenceIds(ingredient: IIngredient): string[] {
  return [
    ...new Set(
      [...(ingredient.sources ?? []), ...(ingredient.references ?? [])]
        .map((reference) =>
          typeof reference === 'string' ? reference : reference.id,
        )
        .filter(Boolean),
    ),
  ];
}

export function useFailedIngredientRecovery({
  scopeKey,
  brandId,
  ingredients,
  getService,
  setIngredients,
  setSelectedIds,
  onRefresh,
}: UseFailedIngredientRecoveryProps) {
  const { openConfirm } = useConfirmModal();
  const { href } = useOrgUrl();
  const router = useRouter();
  const t = useTranslations('pages.library.recovery');
  const notifications = NotificationsService.getInstance();
  const getImages = useAuthedService((token) =>
    ImagesService.getInstance(token),
  );
  const getVideos = useAuthedService((token) =>
    VideosService.getInstance(token),
  );
  const getHandoff = useAuthedService((token) =>
    AgentStudioHandoffService.getInstance(token),
  );
  const [isRecovering, setIsRecovering] = useState(false);
  const [retriedIds, setRetriedIds] = useState<string[]>([]);
  const pendingRef = useRef(false);
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

  const begin = useCallback(
    (snapshotScope: string) => {
      if (pendingRef.current) return false;
      if (snapshotScope !== currentScopeRef.current) {
        notifications.warning(t('scopeChanged'));
        return false;
      }
      pendingRef.current = true;
      setIsRecovering(true);
      return true;
    },
    [notifications, t],
  );

  const finish = useCallback(() => {
    pendingRef.current = false;
    setIsRecovering(false);
  }, []);

  const handleDeleteFailedIngredients = useCallback(
    (ids: string[]) => {
      const failedIds = new Set(
        ingredients
          .filter((ingredient) => ingredient.status === IngredientStatus.FAILED)
          .map((ingredient) => ingredient.id),
      );
      const snapshot = [...new Set(ids)].filter((id) => failedIds.has(id));
      if (snapshot.length === 0 || pendingRef.current) return;
      const snapshotScope = scopeKey;
      openConfirm({
        confirmLabel: t('delete'),
        isError: true,
        label: t('confirmDeleteTitle', { count: snapshot.length }),
        message: t('confirmDeleteMessage', { count: snapshot.length }),
        onConfirm: async () => {
          if (!begin(snapshotScope)) return;
          const deleted = new Set<string>();
          try {
            const service = await getService();
            // The API accepts at most 100 IDs. Each batch keeps the confirmed snapshot.
            for (let offset = 0; offset < snapshot.length; offset += 100) {
              const batch = snapshot.slice(offset, offset + 100);
              try {
                const result = await service.bulkDelete({
                  ids: batch,
                  type: 'ingredients-delete',
                });
                const batchIds = new Set(batch);
                for (const id of result.deleted)
                  if (batchIds.has(id)) deleted.add(id);
              } catch (error) {
                logger.error('Failed to trash a batch of failed assets', error);
              }
            }
            setIngredients((current) =>
              current.filter((ingredient) => !deleted.has(ingredient.id)),
            );
            setSelectedIds((current) =>
              current.filter((id) => !deleted.has(id)),
            );
            if (deleted.size > 0)
              notifications.success(t('deleted', { count: deleted.size }));
            const failedCount = snapshot.length - deleted.size;
            if (failedCount > 0)
              notifications.error(t('deleteFailed', { count: failedCount }));
            // Refresh broadcasts shelf counts and keeps server-authoritative survivors.
            await onRefresh(true);
          } catch (error) {
            logger.error('Failed to delete failed Library assets', error);
            notifications.error(
              t('deleteFailed', { count: snapshot.length - deleted.size }),
            );
          } finally {
            finish();
          }
        },
      });
    },
    [
      begin,
      finish,
      getService,
      ingredients,
      notifications,
      onRefresh,
      openConfirm,
      scopeKey,
      setIngredients,
      setSelectedIds,
      t,
    ],
  );

  const handleRetryFailedIngredients = useCallback(
    (requested: IIngredient[]) => {
      const eligibleIds = new Set(
        ingredients
          .filter(
            (ingredient) =>
              ingredient.status === IngredientStatus.FAILED &&
              getIngredientRecovery(ingredient).group === 'retry',
          )
          .map((ingredient) => ingredient.id),
      );
      const snapshot = [
        ...new Map(
          requested
            .filter(
              (ingredient) =>
                eligibleIds.has(ingredient.id) &&
                !retriedIds.includes(ingredient.id),
            )
            .map((ingredient) => [ingredient.id, ingredient]),
        ).values(),
      ];
      if (snapshot.length === 0 || pendingRef.current) return;
      const snapshotScope = scopeKey;
      openConfirm({
        confirmLabel: t('actions.retry'),
        label: t('confirmRetryTitle', { count: snapshot.length }),
        message: t('confirmRetryMessage', { count: snapshot.length }),
        onConfirm: async () => {
          if (!begin(snapshotScope)) return;
          let started = 0;
          try {
            // Sequential submission avoids flooding an already struggling provider.
            for (const ingredient of snapshot) {
              if (currentScopeRef.current !== snapshotScope) break;
              try {
                const saved: IVideo = ingredient;
                const payload: Partial<IImage & IVideo> = {
                  brandId: ingredient.brandId || brandId || undefined,
                  category: ingredient.category,
                  camera: ingredient.camera,
                  style: ingredient.style,
                  mood: ingredient.mood,
                  blacklist: ingredient.blacklist,
                  sounds: ingredient.sounds,
                  folderId:
                    ingredient.folderId ||
                    (typeof ingredient.folder === 'string'
                      ? ingredient.folder
                      : ingredient.folder?.id),
                  format: ingredient.format ?? ingredient.ingredientFormat,
                  height: ingredient.height,
                  aspectRatio: /^\d+:\d+$/.test(ingredient.aspectRatio ?? '')
                    ? ingredient.aspectRatio
                    : undefined,
                  duration: saved.duration,
                  resolution: saved.resolution,
                  model: ingredient.modelUsed || ingredient.model,
                  references: referenceIds(ingredient),
                  seed: ingredient.seed,
                  text:
                    getIngredientPromptText(ingredient) ||
                    ingredient.text?.trim(),
                  width: ingredient.width,
                };
                const service =
                  ingredient.category === IngredientCategory.IMAGE
                    ? await getImages()
                    : await getVideos();
                await service.post(payload);
                started += 1;
                setRetriedIds((current) => [...current, ingredient.id]);
              } catch (error) {
                logger.error('Failed to retry a Library asset', error);
              }
            }
            if (started > 0)
              notifications.success(t('retried', { count: started }));
            if (started < snapshot.length)
              notifications.error(
                t('retryFailed', { count: snapshot.length - started }),
              );
            await onRefresh(true);
          } finally {
            finish();
          }
        },
      });
    },
    [
      begin,
      brandId,
      finish,
      getImages,
      getVideos,
      ingredients,
      notifications,
      onRefresh,
      openConfirm,
      retriedIds,
      scopeKey,
      t,
    ],
  );

  const handleReviewFailedIngredient = useCallback(
    async (ingredient: IIngredient) => {
      const prompt =
        getIngredientPromptText(ingredient) || ingredient.text?.trim();
      const modelKey = getIngredientModelLabel(ingredient);
      if (
        !brandId ||
        !prompt ||
        !modelKey ||
        (ingredient.category !== IngredientCategory.IMAGE &&
          ingredient.category !== IngredientCategory.VIDEO)
      ) {
        notifications.warning(t('reviewUnavailable'));
        return;
      }
      const snapshotScope = scopeKey;
      if (!begin(snapshotScope)) return;
      try {
        const payload: AgentStudioHandoffPayload = {
          brandId,
          modelKey,
          outputs: 1,
          prompt,
          references: referenceIds(ingredient),
          type:
            ingredient.category === IngredientCategory.IMAGE
              ? 'image'
              : 'video',
        };
        if (ingredient.width && ingredient.height) {
          const gcd = (a: number, b: number): number =>
            b === 0 ? a : gcd(b, a % b);
          const divisor = gcd(ingredient.width, ingredient.height);
          payload.aspectRatio = `${ingredient.width / divisor}:${ingredient.height / divisor}`;
        }
        const service = await getHandoff();
        const { id } = await service.create(payload);
        if (snapshotScope === currentScopeRef.current)
          router.push(
            href(
              `${APP_ROUTES.STUDIO.GENERATE}?handoff=${encodeURIComponent(id)}`,
            ),
          );
      } catch (error) {
        logger.error('Failed to open failed inputs in Studio', error);
        notifications.error(t('reviewUnavailable'));
      } finally {
        finish();
      }
    },
    [
      begin,
      brandId,
      finish,
      getHandoff,
      href,
      notifications,
      router,
      scopeKey,
      t,
    ],
  );

  return {
    handleDeleteFailedIngredients,
    handleRetryFailedIngredients,
    handleReviewFailedIngredient,
    isRecovering,
    retriedIds,
  };
}
