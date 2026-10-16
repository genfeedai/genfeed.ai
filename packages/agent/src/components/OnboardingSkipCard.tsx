'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

export function OnboardingSkipCard({
  isSubmitting = false,
  onSkip,
}: {
  isSubmitting?: boolean;
  onSkip: () => void | Promise<void>;
}): ReactElement {
  const translate = useTranslations('agent.inputRequest');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-background-secondary p-4"
      data-testid="onboarding-skip-card"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {translate('skipCardTitle')}
        </h3>
        <p className="text-xs leading-5 text-foreground/70">
          {translate('skipCardBody')}
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          isDisabled={isSubmitting}
          onClick={() => setIsConfirmOpen(true)}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('skipCardTitle')}
        </Button>
      </div>
      <Dialog onOpenChange={setIsConfirmOpen} open={isConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate('skipConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {translate('skipConfirmBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setIsConfirmOpen(false)}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              {translate('skipStay')}
            </Button>
            <Button
              isDisabled={isSubmitting}
              onClick={() => {
                setIsConfirmOpen(false);
                void onSkip();
              }}
              withWrapper={false}
            >
              {translate('skipConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
