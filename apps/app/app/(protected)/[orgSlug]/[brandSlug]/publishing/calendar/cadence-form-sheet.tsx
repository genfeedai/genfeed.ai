'use client';

import {
  ButtonSize,
  ButtonVariant,
  CadenceGenerateLanding,
  PostCategory,
} from '@genfeedai/enums';
import type { IPostingCadence } from '@genfeedai/interfaces';
import type { CreatePostingCadenceInput } from '@services/content/posting-cadences.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const CADENCE_FORMATS = [
  PostCategory.ARTICLE,
  PostCategory.IMAGE,
  PostCategory.POST,
  PostCategory.REEL,
  PostCategory.STORY,
  PostCategory.TEXT,
  PostCategory.VIDEO,
] as const;

type CadenceFormSheetProps = {
  brandId: string;
  cadence?: IPostingCadence | null;
  credentialId: string;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onDelete?: () => void;
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

function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

export default function CadenceFormSheet({
  brandId,
  cadence,
  credentialId,
  isOpen,
  isPending,
  onClose,
  onDelete,
  onSubmit,
}: CadenceFormSheetProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.calendar');
  const [brief, setBrief] = useState('');
  const [endDate, setEndDate] = useState(plusDaysIsoDate(14));
  const [format, setFormat] = useState<PostCategory>(PostCategory.REEL);
  const [generateLanding, setGenerateLanding] = useState(
    CadenceGenerateLanding.DRAFT,
  );
  const [intervalHours, setIntervalHours] = useState('2');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [windowStart, setWindowStart] = useState('08:00');
  const isEditing = Boolean(cadence);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!cadence) {
      setBrief('');
      setEndDate(plusDaysIsoDate(14));
      setFormat(PostCategory.REEL);
      setGenerateLanding(CadenceGenerateLanding.DRAFT);
      setIntervalHours('2');
      setStartDate(todayIsoDate());
      setWindowEnd('22:00');
      setWindowStart('08:00');
      return;
    }

    setBrief(cadence.brief ?? '');
    setEndDate(cadence.endsAt ? isoDate(cadence.endsAt) : plusDaysIsoDate(14));
    setFormat(cadence.format);
    setGenerateLanding(cadence.generateLanding);
    setIntervalHours(String(Math.max(1, cadence.intervalMinutes / 60)));
    setStartDate(isoDate(cadence.startsAt));
    setWindowEnd(timeFromMinutes(cadence.windowEndMinute));
    setWindowStart(timeFromMinutes(cadence.windowStartMinute));
  }, [cadence, isOpen]);

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
          <SheetTitle>
            {isEditing ? translate('editCadence') : translate('newCadence')}
          </SheetTitle>
          <SheetDescription>{translate('description')}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <SelectField
            label="Format"
            name="cadence-format"
            onChange={(event) => setFormat(event.target.value as PostCategory)}
            value={format}
          >
            {CADENCE_FORMATS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="On generate"
            name="cadence-landing"
            onChange={(event) =>
              setGenerateLanding(event.target.value as CadenceGenerateLanding)
            }
            value={generateLanding}
          >
            <option value={CadenceGenerateLanding.DRAFT}>
              {translate('landingDraft')}
            </option>
            <option value={CadenceGenerateLanding.SCHEDULED}>
              {translate('landingScheduled')}
            </option>
          </SelectField>
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
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isPending || !credentialId}
              onClick={() => {
                const hours = Number(intervalHours);
                onSubmit({
                  brief: brief || undefined,
                  brandId,
                  credentialId,
                  endsAt: `${endDate}T23:59:59.000Z`,
                  format,
                  generateLanding,
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
              {isEditing ? translate('saveChanges') : translate('saveCadence')}
            </Button>
            {isEditing && onDelete ? (
              <Button
                isDisabled={isPending}
                onClick={onDelete}
                size={ButtonSize.SM}
                variant={ButtonVariant.DESTRUCTIVE}
              >
                {translate('deleteCadence')}
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
