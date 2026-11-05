'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { usePageScope } from '@hooks/navigation/use-page-scope/use-page-scope';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { readRelationshipId } from '@/features/library-remix/library-remix-reference';
import { useIngredientSidebar } from '@/hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

// A link opened straight from another page races auth, brand and organization
// settling: the first lookup can fail for a reason that clears a moment later.
// Retry quietly and keep the neutral "opening" state instead of flashing the
// unavailable error before the real answer arrives.
const LOOKUP_RETRY_DELAYS_MS = [400, 1200];

type LinkedIngredient = Awaited<ReturnType<IngredientsService['findOne']>>;

/**
 * Opens the `?asset=` Library asset in the sidebar. The lookup is cached per
 * organization and asset, so following the same link again opens the asset at
 * once and refreshes the record in the background. The record is checked
 * against the current scope on every render: a brand page opens only that
 * brand's assets, the organization Library any brand's, and never another
 * organization's.
 */
export default function AssetDeepLink() {
  const translate = useTranslations('pages.library.assetDeepLink');
  const assetId = useSearchParams().get('asset');
  const { brandId, isReady, organizationId } = useBrand();
  // The organization Library spans every brand, so only a brand page pins the
  // linked asset to one.
  const isBrandScoped = usePageScope() !== 'org';
  const { openIngredientSidebar } = useIngredientSidebar();
  const isSafeId = assetId !== null && SAFE_IDENTIFIER_PATTERN.test(assetId);
  // Scope still settling: wait for it rather than reporting the asset gone.
  const isScopeReady =
    isReady && Boolean(organizationId) && (!isBrandScoped || Boolean(brandId));
  const isLookupEnabled = isSafeId && isScopeReady;

  const assetQuery = useAuthedQuery<IngredientsService, LinkedIngredient>({
    enabled: isLookupEnabled,
    queryFn: async (service, signal) => {
      // A lookup superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      return service.findOne(assetId ?? '', {}, signal);
    },
    queryKey: ['library-asset', organizationId ?? null, assetId],
    retry: LOOKUP_RETRY_DELAYS_MS.length,
    retryDelay: (failureCount) =>
      LOOKUP_RETRY_DELAYS_MS[failureCount] ?? LOOKUP_RETRY_DELAYS_MS[0],
    service: (token: string) => IngredientsService.getInstance(token),
  });

  const ingredient = isLookupEnabled ? assetQuery.data : undefined;
  const isInScope = ingredient
    ? ingredient.id === assetId &&
      !ingredient.isDeleted &&
      (!isBrandScoped ||
        (ingredient.brandId ?? readRelationshipId(ingredient.brand)) ===
          brandId) &&
      (ingredient.organizationId ??
        readRelationshipId(ingredient.organization)) === organizationId
    : false;
  const openKey = `${organizationId}:${brandId}:${assetId}`;
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  // Once the link is gone, the same asset can be linked again.
  useEffect(() => {
    if (!assetId) setOpenedKey(null);
  }, [assetId]);

  useEffect(() => {
    if (!ingredient || !isInScope || openedKey === openKey) return;
    openIngredientSidebar(ingredient);
    setOpenedKey(openKey);
  }, [ingredient, isInScope, openIngredientSidebar, openKey, openedKey]);

  const lookupError = isLookupEnabled ? assetQuery.error : null;
  useEffect(() => {
    if (!lookupError) return;
    logger.warn('Could not open linked library asset', {
      error: lookupError,
      reportToSentry: false,
    });
  }, [lookupError]);

  if (!assetId || openedKey === openKey) return null;
  if (!isSafeId || (ingredient && !isInScope) || (lookupError && !ingredient)) {
    return (
      <Alert variant="destructive" icon={false}>
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
