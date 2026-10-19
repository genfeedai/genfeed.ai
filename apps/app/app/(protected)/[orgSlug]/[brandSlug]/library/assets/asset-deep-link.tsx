'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePageScope } from '@hooks/navigation/use-page-scope/use-page-scope';
import { useIngredientSidebar } from '@hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { readRelationshipId } from '@/features/library-remix/library-remix-reference';

export default function AssetDeepLink() {
  const translate = useTranslations('pages.library.assetDeepLink');
  const assetId = useSearchParams().get('asset');
  const { brandId, isReady, organizationId } = useBrand();
  // The organization Library spans every brand, so only a brand page pins the
  // linked asset to one.
  const isBrandScoped = usePageScope() !== 'org';
  const { openIngredientSidebar } = useIngredientSidebar();
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
        (isBrandScoped && !brandId) ||
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
          (isBrandScoped && ingredientBrandId !== brandId) ||
          ingredientOrganizationId !== organizationId
        ) {
          setState('error');
          return;
        }
        openedKey.current = key;
        openIngredientSidebar(ingredient);
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
    isBrandScoped,
    openIngredientSidebar,
    organizationId,
  ]);

  if (!assetId || state === 'opened') return null;
  if (state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>{translate('unavailable')}</AlertDescription>
      </Alert>
    );
  }
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {translate('opening')}
    </p>
  );
}
