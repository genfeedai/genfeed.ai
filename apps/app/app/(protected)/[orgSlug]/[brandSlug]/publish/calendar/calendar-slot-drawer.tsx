'use client';

import { ButtonSize, ButtonVariant, CalendarSlotState } from '@genfeedai/enums';
import type { ICalendarSlot } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { useState } from 'react';

type CalendarSlotDrawerProps = {
  isPending: boolean;
  onCancel: () => void;
  onClose: () => void;
  onEditCadence?: () => void;
  onGenerate: (brief?: string) => void;
  onSkip: () => void;
  onWrite: () => void;
  slot: ICalendarSlot | null;
};

export default function CalendarSlotDrawer({
  isPending,
  onCancel,
  onClose,
  onEditCadence,
  onGenerate,
  onSkip,
  onWrite,
  slot,
}: CalendarSlotDrawerProps): React.JSX.Element {
  const [brief, setBrief] = useState('');
  const isGenerating = slot?.state === CalendarSlotState.GENERATING;

  return (
    <Sheet
      open={slot !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Missing slot</SheetTitle>
          <SheetDescription>
            {slot
              ? `${slot.format} · ${new Date(slot.instant).toLocaleString()}`
              : 'Booked calendar hole'}
          </SheetDescription>
        </SheetHeader>
        {slot ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {slot.state === CalendarSlotState.GENERATE_FAILED
                ? slot.lastFailureReason || 'Last generate failed.'
                : slot.cadenceId
                  ? 'Generate writes the next campaign post from brand voice and already scheduled content. Write opens the composer.'
                  : 'Write is the default for a one-off booking. Generate still writes from brand voice and nearby scheduled posts.'}
            </p>
            <Input
              label="Brief override"
              name="slot-brief"
              onChange={(event) => setBrief(event.target.value)}
              placeholder={slot.resolvedBrief || 'Optional prompt'}
              value={brief}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                isDisabled={isPending || isGenerating}
                onClick={() => onGenerate(brief || undefined)}
                size={ButtonSize.SM}
              >
                Generate
              </Button>
              <Button
                isDisabled={isPending || isGenerating}
                onClick={onWrite}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                Write
              </Button>
              {isGenerating ? (
                <Button
                  isDisabled={isPending}
                  onClick={onCancel}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  isDisabled={isPending}
                  onClick={onSkip}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  Skip
                </Button>
              )}
              {slot.cadenceId && onEditCadence ? (
                <Button
                  isDisabled={isPending}
                  onClick={onEditCadence}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  Edit cadence
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
