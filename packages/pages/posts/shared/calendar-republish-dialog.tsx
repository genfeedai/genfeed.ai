'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { CalendarRepublishDialogProps } from '@props/publisher/release-calendar.props';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
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

export const CALENDAR_MOVE_ACTION = 'calendar-move';
export const CALENDAR_REPUBLISH_ACTION = 'republish';

export default function CalendarRepublishDialog({
  isOpen,
  onCancel,
  onChooseCardOnly,
  onChooseRepublish,
  pendingAction,
}: CalendarRepublishDialogProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.calendar');
  const isPending = pendingAction !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{translate('republishTitle')}</DialogTitle>
          <DialogDescription>
            {translate('republishDescription')}
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>{translate('republishOutcomesTitle')}</AlertTitle>
          <AlertDescription>
            {translate('republishOutcomesBody')}
          </AlertDescription>
        </Alert>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            isDisabled={isPending}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={onCancel}
          >
            {translate('cancel')}
          </Button>
          <Button
            isDisabled={isPending}
            isLoading={pendingAction === CALENDAR_MOVE_ACTION}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={onChooseCardOnly}
          >
            {translate('moveCardOnly')}
          </Button>
          <Button
            isDisabled={isPending}
            isLoading={pendingAction === CALENDAR_REPUBLISH_ACTION}
            withWrapper={false}
            onClick={onChooseRepublish}
          >
            {translate('publishAgain')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
