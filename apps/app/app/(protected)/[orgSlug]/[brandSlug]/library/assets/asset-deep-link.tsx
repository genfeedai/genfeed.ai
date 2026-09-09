'use client';

import { useIngredientOverlay } from '@contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { readRelationshipId } from '@/features/library-remix/library-remix-reference';

export default function AssetDeepLink() {
  const assetId = useSearchParams().get('asset');
  const { brandId, isReady, organizationId } = useBrand();
  const { openIngredientOverlay } = useIngredientOverlay();
  const getService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const [state, setState] = useState<'loading' | 'opened' | 'error'>('loading');
  const openedKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function openAsset() {
      if (!assetId) {
        openedKey.current = null;
        return;
      }
      if (!isReady) return;
      const key = `${organizationId}:${brandId}:${assetId}`;
      if (openedKey.current === key) return;
      if (
        !brandId ||
        !organizationId ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(assetId)
      ) {
        setState('error');
        return;
      }
      setState('loading');
      try {
        const service = await getService();
        controller.signal.throwIfAborted();
        const ingredient = await service.findOne(
          assetId,
          {},
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const ingredientBrandId =
          ingredient.brandId ?? readRelationshipId(ingredient.brand);
        const ingredientOrganizationId =
          ingredient.organizationId ??
          readRelationshipId(ingredient.organization);
        if (
          ingredient.id !== assetId ||
          ingredient.isDeleted ||
          ingredientBrandId !== brandId ||
          ingredientOrganizationId !== organizationId
        ) {
          setState('error');
          return;
        }
        openedKey.current = key;
        openIngredientOverlay(ingredient);
        setState('opened');
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.warn('Could not open linked library asset', {
          error,
          reportToSentry: false,
        });
        setState('error');
      }
    }
    void openAsset();
    return () => controller.abort();
  }, [
    assetId,
    brandId,
    getService,
    isReady,
    openIngredientOverlay,
    organizationId,
  ]);

  if (!assetId || state === 'opened') return null;
  if (state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This asset is unavailable in this brand, or you no longer have access
          to it.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Opening your asset…
    </p>
  );
}
