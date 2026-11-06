'use client';

import { ButtonVariant, Timeframe } from '@genfeedai/contracts';
import type { DateRange as AnalyticsDateRange } from '@genfeedai/contracts/interfaces/utils/date.interface';
import { cn } from '@genfeedai/helpers';
import {
  formatUtcChipDate,
  getTrailingUtcDays,
} from '@genfeedai/helpers/utils/date-range.util';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { DateRange as CalendarDateRange } from 'react-day-picker';
import { Button } from './button';
import { Calendar } from './calendar';
import {
  fieldControlClassName,
  fieldControlPopoverClassName,
} from './field-control';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const PRESET_OPTIONS = [Timeframe.D7, Timeframe.D30, Timeframe.D90] as const;

type DateRangePreset = Timeframe.D7 | Timeframe.D30 | Timeframe.D90;

export interface DateRangePickerProps {
  onChange?: (range: AnalyticsDateRange) => void;
  defaultPreset?: DateRangePreset;
  className?: string;
  value?: AnalyticsDateRange;
}

const PRESET_DAYS = {
  [Timeframe.D7]: 7,
  [Timeframe.D30]: 30,
  [Timeframe.D90]: 90,
} as const;

function formatSelectedDateRange(
  dateRange: CalendarDateRange | undefined,
): string {
  if (!dateRange?.from) {
    return 'Select dates';
  }

  if (!dateRange.to) {
    return formatUtcChipDate(dateRange.from, true);
  }

  return `${formatUtcChipDate(dateRange.from, false)} - ${formatUtcChipDate(dateRange.to, true)}`;
}

/** The API reads days by their UTC date, so a picked day is that day at UTC midnight. */
function toUtcDay(day: Date): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
}

/** The calendar draws local days; the picker stores UTC days. */
function calendarDayOf(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toCalendarDay(date: Date | undefined): Date | undefined {
  return date ? calendarDayOf(date) : undefined;
}

function getPresetForRange(
  range: AnalyticsDateRange,
): DateRangePreset | 'custom' {
  if (!range.startDate || !range.endDate) {
    return 'custom';
  }
  const durationDays =
    Math.round(
      (range.endDate.getTime() - range.startDate.getTime()) / 86_400_000,
    ) + 1;
  if (durationDays === 7) {
    return Timeframe.D7;
  }
  if (durationDays === 30) {
    return Timeframe.D30;
  }
  if (durationDays === 90) {
    return Timeframe.D90;
  }
  return 'custom';
}

export default function DateRangePicker({
  onChange = () => {},
  defaultPreset = Timeframe.D7,
  className = '',
  value,
}: DateRangePickerProps) {
  const translate = useTranslations('ui.dateRangePicker');
  const [selectedPreset, setSelectedPreset] = useState<
    DateRangePreset | 'custom'
  >(defaultPreset);
  const [open, setOpen] = useState(false);
  // The first day of a custom range, while the second is still to be picked.
  const [rangeAnchor, setRangeAnchor] = useState<Date | null>(null);

  // The last pickable day: yesterday by its UTC date, drawn as a calendar day.
  const yesterday = calendarDayOf(getTrailingUtcDays(1).endDate);
  const [dateRange, setDateRange] = useState<CalendarDateRange | undefined>(
    () => {
      const range = getTrailingUtcDays(PRESET_DAYS[defaultPreset]);
      return { from: range.startDate, to: range.endDate };
    },
  );

  const valueStartTime = value?.startDate?.getTime() ?? null;
  const valueEndTime = value?.endDate?.getTime() ?? null;

  useEffect(() => {
    if (valueStartTime === null || valueEndTime === null) {
      return;
    }
    const nextValue = {
      endDate: new Date(valueEndTime),
      startDate: new Date(valueStartTime),
    };
    setDateRange({ from: nextValue.startDate, to: nextValue.endDate });
    setSelectedPreset(getPresetForRange(nextValue));
  }, [valueEndTime, valueStartTime]);

  const handlePresetChange = (preset: DateRangePreset) => {
    setSelectedPreset(preset);

    const { endDate, startDate } = getTrailingUtcDays(PRESET_DAYS[preset]);

    setDateRange({ from: startDate, to: endDate });
    onChange({ endDate, startDate });
    handleOpenChange(false);
  };

  // A range is two clicks. The calendar's own range logic extends the previous
  // range on the first click, which would commit it and close the popover
  // before the second day is picked, so the clicks are counted here.
  const handleDayClick = (day: Date) => {
    const picked = toUtcDay(day);

    if (!rangeAnchor) {
      setRangeAnchor(picked);
      return;
    }

    const [startDate, endDate] =
      picked < rangeAnchor ? [picked, rangeAnchor] : [rangeAnchor, picked];

    setRangeAnchor(null);
    setDateRange({ from: startDate, to: endDate });
    setSelectedPreset('custom');
    onChange({ endDate, startDate });
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setRangeAnchor(null);
    }
  };

  const calendarSelection: CalendarDateRange | undefined = rangeAnchor
    ? { from: toCalendarDay(rangeAnchor) }
    : dateRange?.from
      ? {
          from: toCalendarDay(dateRange.from),
          to: toCalendarDay(dateRange.to),
        }
      : undefined;

  return (
    <div className={cn('flex items-center', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              fieldControlClassName,
              'w-60 justify-start font-normal text-left',
              !dateRange && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
            {formatSelectedDateRange(dateRange)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn('w-auto p-0', fieldControlPopoverClassName)}
          align="end"
        >
          <div className="border-b border-border p-2">
            <fieldset className="grid grid-cols-3 gap-1">
              <legend className="sr-only">{translate('quickRanges')}</legend>
              {PRESET_OPTIONS.map((preset) => (
                <Button
                  key={preset}
                  ariaLabel={`Last ${preset.replace('d', '')} days`}
                  className={cn(
                    'h-8 px-3 text-xs',
                    selectedPreset === preset
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground',
                  )}
                  onClick={() => handlePresetChange(preset)}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  {preset}
                </Button>
              ))}
            </fieldset>
          </div>
          <Calendar
            mode="range"
            selected={calendarSelection}
            onDayClick={handleDayClick}
            endMonth={yesterday}
            disabled={{ after: yesterday }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
