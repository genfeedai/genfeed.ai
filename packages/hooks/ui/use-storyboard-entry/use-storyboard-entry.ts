'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { isOwnedStoryboardEntryAsset } from '@hooks/ui/use-storyboard-entry/storyboard-entry-eligibility';
import { runStoryboardEntryIntent } from '@hooks/ui/use-storyboard-entry/storyboard-entry-intents';
import { ContentRunsService } from '@services/content/content-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Creates a durable draft from an owned asset; defaults and idempotency live on the server. */
export function useStoryboardEntry() {
  const { brandId, organizationId } = useBrand();
  const { userId, sessionId } = useAuthIdentity();
  const { href } = useOrgUrl();
  const router = useRouter();
  const translate = useTranslations('ui.quickActions');
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const getIngredients = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const uploadLookupsRef = useRef(new Map<string, Promise<void>>());
  const scope = useMemo(
    () => ({ brandId, organizationId, userId, sessionId, href }),
    [brandId, organizationId, userId, sessionId, href],
  );
  const activeScopeRef = useRef<typeof scope | null>(null);
  const [pending, setPending] = useState<{
    scope: typeof scope;
    assetId: string;
  } | null>(null);
  useLayoutEffect(() => {
    activeScopeRef.current = scope;
    return () => {
      activeScopeRef.current = null;
    };
  }, [scope]);

  const createFromAsset = useCallback(
    (ingredient: IIngredient): Promise<void> => {
      if (
        !userId ||
        !isOwnedStoryboardEntryAsset(ingredient, organizationId, brandId)
      )
        return Promise.resolve();
      const action =
        ingredient.category === IngredientCategory.VIDEO ? 'video' : 'image';
      const key = JSON.stringify([
        organizationId,
        brandId,
        userId,
        action,
        ingredient.id,
      ]);
      const canApply = () => activeScopeRef.current === scope;
      setPending({ scope, assetId: ingredient.id });
      return runStoryboardEntryIntent(key, async (clientRequestId) => {
        try {
          const service = await getService();
          // Auth acquisition itself may resolve after a scope change.
          if (!canApply())
            throw new DOMException('Entry scope changed', 'AbortError');
          const run = await service.createStoryboardRun(brandId, {
            clientRequestId,
            source:
              action === 'video'
                ? { kind: 'uploaded_video', assetId: ingredient.id }
                : { kind: 'brief', brief: '', seedImageAssetId: ingredient.id },
          });
          if (canApply())
            router.push(
              href(
                `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(run.id)}`,
              ),
            );
          return run;
        } catch (error) {
          if (canApply()) {
            logger.error('Failed to create asset storyboard', error);
            const member = getJsonApiErrorMember(error);
            NotificationsService.getInstance().error(
              translate('creationFailed'),
              {
                description:
                  member?.status && member.status >= 400 && member.status < 500
                    ? member.detail
                    : undefined,
                actionLabel:
                  action === 'video'
                    ? translate('remixThisVideo')
                    : 'Add to Storyboard',
                onAction: () => {
                  if (canApply()) void createFromAsset(ingredient);
                },
              },
            );
          }
          throw error;
        }
      })
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          if (canApply()) setPending(null);
        });
    },
    [
      brandId,
      getService,
      href,
      organizationId,
      router,
      scope,
      translate,
      userId,
    ],
  );

  const createFromUploadAssetId = useCallback(
    (assetId: string): Promise<void> => {
      if (!brandId || !organizationId || !userId) return Promise.resolve();
      const key = JSON.stringify([organizationId, brandId, userId, assetId]);
      const existing = uploadLookupsRef.current.get(key);
      if (existing) return existing;
      const canApply = () => activeScopeRef.current === scope;
      const pendingLookup = (async () => {
        try {
          const service = await getIngredients();
          if (!canApply()) return;
          const [ingredient] = await service.findByIds([assetId]);
          if (!canApply()) return;
          if (
            !ingredient ||
            ingredient.category !== IngredientCategory.VIDEO ||
            !isOwnedStoryboardEntryAsset(ingredient, organizationId, brandId)
          )
            throw new Error('Uploaded video is unavailable');
          await createFromAsset(ingredient);
        } catch (error) {
          if (canApply()) {
            logger.error('Failed to resolve uploaded storyboard source', error);
            const member = getJsonApiErrorMember(error);
            NotificationsService.getInstance().error(
              translate('creationFailed'),
              {
                description:
                  member?.status && member.status >= 400 && member.status < 500
                    ? member.detail
                    : undefined,
                actionLabel: translate('remixThisVideo'),
                onAction: () => {
                  if (canApply()) void createFromUploadAssetId(assetId);
                },
              },
            );
          }
        }
      })().finally(() => {
        uploadLookupsRef.current.delete(key);
      });
      uploadLookupsRef.current.set(key, pendingLookup);
      return pendingLookup;
    },
    [
      brandId,
      createFromAsset,
      getIngredients,
      organizationId,
      scope,
      translate,
      userId,
    ],
  );

  const canCreateFromAsset = useCallback(
    (ingredient: IIngredient) =>
      Boolean(
        userId &&
          isOwnedStoryboardEntryAsset(ingredient, organizationId, brandId),
      ),
    [brandId, organizationId, userId],
  );

  return {
    canCreateFromAsset,
    createFromAsset,
    createFromUploadAssetId,
    isCreating: pending?.scope === scope,
    pendingAssetId: pending?.scope === scope ? pending.assetId : null,
  };
}
