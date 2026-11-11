'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import RequestReviewDialog from './request-review-dialog';

/**
 * Ask teammates to review every selected asset in one action, from the same
 * bar as tagging and downloading. Each asset gets its own request and thread.
 */
export default function SelectionReviewAction({
  selectedIngredients,
}: {
  selectedIngredients: readonly IIngredient[];
}) {
  const translate = useTranslations('pages.library.teamReview');
  const [isOpen, setIsOpen] = useState(false);
  const count = selectedIngredients.length;
  const isOverLimit = count > LIBRARY_BULK_TAG_LIMIT;

  return (
    <>
      <Button
        isDisabled={isOverLimit || count === 0}
        label={
          <>
            <UserCheck /> {translate('request')}
          </>
        }
        onClick={() => setIsOpen(true)}
        tooltip={
          isOverLimit
            ? translate('overLimit', { limit: LIBRARY_BULK_TAG_LIMIT })
            : translate('requestSelected', { count })
        }
        variant={ButtonVariant.SECONDARY}
      />
      <RequestReviewDialog
        ingredients={selectedIngredients}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}
