'use client';

import { ButtonSize, PostCategory } from '@genfeedai/enums';
import type { CreatePostingCadenceInput } from '@services/content/posting-cadences.service';
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

type CadenceFormSheetProps = {
  brandId: string;
  credentialId: string;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePostingCadenceInput) => void;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesFromTime(value: string, fallback: number): number {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback;
  }
  return hours * 60 + minutes;
}

export default function CadenceFormSheet({
  brandId,
  credentialId,
  isOpen,
  isPending,
  onClose,
  onSubmit,
}: CadenceFormSheetProps): React.JSX.Element {
  const [brief, setBrief] = useState('');
  const [endDate, setEndDate] = useState(plusDaysIsoDate(14));
  const [intervalHours, setIntervalHours] = useState('2');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [windowStart, setWindowStart] = useState('08:00');

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New cadence</SheetTitle>
          <SheetDescription>
            Book missing shorts, tweets, or posts on the calendar. Generate or
            write each hole later.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <Input
            label="Every (hours)"
            name="interval-hours"
            onChange={(event) => setIntervalHours(event.target.value)}
            type="number"
            value={intervalHours}
          />
          <Input
            label="Window start"
            name="window-start"
            onChange={(event) => setWindowStart(event.target.value)}
            type="time"
            value={windowStart}
          />
          <Input
            label="Window end"
            name="window-end"
            onChange={(event) => setWindowEnd(event.target.value)}
            type="time"
            value={windowEnd}
          />
          <Input
            label="Starts"
            name="starts-at"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
          <Input
            label="Ends"
            name="ends-at"
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
          <Input
            label="Brief"
            name="cadence-brief"
            onChange={(event) => setBrief(event.target.value)}
            placeholder="YouTube Short about the brand"
            value={brief}
          />
          <Button
            isDisabled={isPending || !credentialId}
            onClick={() => {
              const hours = Number(intervalHours);
              onSubmit({
                brief: brief || undefined,
                brandId,
                credentialId,
                endsAt: `${endDate}T23:59:59.000Z`,
                format: PostCategory.REEL,
                intervalMinutes: Number.isFinite(hours)
                  ? Math.max(15, hours * 60)
                  : 120,
                startsAt: `${startDate}T00:00:00.000Z`,
                windowEndMinute: minutesFromTime(windowEnd, 22 * 60),
                windowStartMinute: minutesFromTime(windowStart, 8 * 60),
              });
            }}
            size={ButtonSize.SM}
          >
            Save cadence
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
