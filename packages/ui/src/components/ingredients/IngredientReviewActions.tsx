'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ContentRating,
  IngredientStatus,
} from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IngredientReviewActionsProps } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function IngredientReviewActions({
  ingredient,
  onUpdated,
}: IngredientReviewActionsProps) {
  const translate = useTranslations('pages.library.review');
  const { selectedBrand, settings } = useBrand();
  const isMediaLocked = Boolean(
    selectedBrand?.isFleetEnabled &&
      ingredient.personaSlug &&
      ingredient.contentRating !== ContentRating.SFW &&
      !settings?.isFleetNsfwVisible,
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const getService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  if (
    isMediaLocked ||
    ![
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
      IngredientStatus.DRAFT,
      IngredientStatus.UPLOADED,
    ].includes(ingredient.status)
  ) {
    return null;
  }

  const review = async (status: IngredientStatus) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const service = await getService();
      const updated = await service.patch(ingredient.id, { status });
      onUpdated(updated);
      window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
    } catch (error) {
      logger.error('Failed to review Library asset', error);
      NotificationsService.getInstance().error(translate('saveFailed'));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-1 rounded-md bg-background/90 p-0.5"
      role="group"
      aria-label={translate('label')}
    >
      <Button
        ariaLabel={translate('approve')}
        tooltip={translate('approve')}
        icon={<Check className="size-4" />}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
        isDisabled={
          isSaving || ingredient.status === IngredientStatus.VALIDATED
        }
        onClick={() => void review(IngredientStatus.VALIDATED)}
      />
      <Button
        ariaLabel={translate('reject')}
        tooltip={translate('reject')}
        icon={<X className="size-4" />}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
        isDisabled={isSaving}
        onClick={() => void review(IngredientStatus.REJECTED)}
      />
    </div>
  );
}
