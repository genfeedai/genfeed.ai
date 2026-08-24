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

export const CALENDAR_MOVE_ACTION = 'calendar-move';
export const CALENDAR_REPUBLISH_ACTION = 'republish';

export default function CalendarRepublishDialog({
  isOpen,
  onCancel,
  onChooseCardOnly,
  onChooseRepublish,
  pendingAction,
}: CalendarRepublishDialogProps): React.JSX.Element {
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
          <DialogTitle>Move the card or publish again?</DialogTitle>
          <DialogDescription>
            Choose whether to only change where this sits on the calendar, or to
            publish again at the new time.
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>Two different outcomes</AlertTitle>
          <AlertDescription>
            Move card only keeps the live post as-is and does not publish.
            Publish again creates a new scheduled post at this time.
          </AlertDescription>
        </Alert>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            isDisabled={isPending}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            isDisabled={isPending}
            isLoading={pendingAction === CALENDAR_MOVE_ACTION}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={onChooseCardOnly}
          >
            Move card only
          </Button>
          <Button
            isDisabled={isPending}
            isLoading={pendingAction === CALENDAR_REPUBLISH_ACTION}
            withWrapper={false}
            onClick={onChooseRepublish}
          >
            Publish again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
