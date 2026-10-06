'use client';

import {
  ButtonSize,
  ButtonVariant,
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
import { useRef, useState } from 'react';

export default function IngredientReviewActions({
  ingredient,
  onUpdated,
}: IngredientReviewActionsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const getService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  if (
    ![
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
      IngredientStatus.DRAFT,
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
      NotificationsService.getInstance().error(
        'Could not save your review. Try again.',
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-1 rounded-md bg-background/90 p-0.5"
      role="group"
      aria-label="Review asset"
    >
      <Button
        ariaLabel="Approve asset"
        tooltip="Approve asset"
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
        ariaLabel="Reject asset"
        tooltip="Reject asset"
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
