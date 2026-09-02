'use client';

import {
  ButtonSize,
  ButtonVariant,
  CalendarSlotState,
} from '@genfeedai/contracts';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('pages.publishing.calendar');
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
          <SheetTitle>{translate('missingSlot')}</SheetTitle>
          <SheetDescription>
            {slot
              ? `${slot.format} · ${new Date(slot.instant).toLocaleString()}`
              : translate('bookedHole')}
          </SheetDescription>
        </SheetHeader>
        {slot ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {slot.state === CalendarSlotState.GENERATE_FAILED
                ? slot.lastFailureReason || translate('generateFailed')
                : slot.cadenceId
                  ? translate('generateCadenceHint')
                  : translate('generateOneOffHint')}
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
                {translate('generate')}
              </Button>
              <Button
                isDisabled={isPending || isGenerating}
                onClick={onWrite}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                {translate('write')}
              </Button>
              {isGenerating ? (
                <Button
                  isDisabled={isPending}
                  onClick={onCancel}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  {translate('cancel')}
                </Button>
              ) : (
                <Button
                  isDisabled={isPending}
                  onClick={onSkip}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  {translate('skip')}
                </Button>
              )}
              {slot.cadenceId && onEditCadence ? (
                <Button
                  isDisabled={isPending}
                  onClick={onEditCadence}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  {translate('editCadence')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
