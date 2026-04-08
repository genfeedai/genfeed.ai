'use client';

import { ButtonVariant, Timeframe } from '@genfeedai/enums';
import type { DateRange as AnalyticsDateRange } from '@genfeedai/interfaces/utils/date.interface';
import { format, subDays } from 'date-fns';
import { useState } from 'react';
import type { DateRange as CalendarDateRange } from 'react-day-picker';
import { HiCalendarDays } from 'react-icons/hi2';
import { cn } from '../lib/utils';
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
}

function getStartDate(
  preset: DateRangePreset | 'custom',
  yesterday: Date,
): Date | undefined {
  if (preset === 'custom') {
    return undefined;
  }

  const daysMap = {
    [Timeframe.D7]: 7,
    [Timeframe.D30]: 30,
    [Timeframe.D90]: 90,
  } as const;

  return subDays(yesterday, daysMap[preset] - 1);
}

function formatSelectedDateRange(
  dateRange: CalendarDateRange | undefined,
): string {
  if (!dateRange?.from) {
    return 'Select dates';
  }

  if (!dateRange.to) {
    return format(dateRange.from, 'MMM d, yyyy');
  }

  return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
}

export default function DateRangePicker({
  onChange = () => {},
  defaultPreset = Timeframe.D7,
  className = '',
}: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<
    DateRangePreset | 'custom'
  >(defaultPreset);
  const [open, setOpen] = useState(false);

  const yesterday = subDays(new Date(), 1);
  const [dateRange, setDateRange] = useState<CalendarDateRange | undefined>({
    from: getStartDate(defaultPreset, yesterday),
    to: yesterday,
  });

  const handlePresetChange = (preset: DateRangePreset) => {
    setSelectedPreset(preset);

    const startDate = getStartDate(preset, yesterday);
    const endDate = yesterday;

    setDateRange({ from: startDate, to: endDate });
    onChange({ endDate, startDate: startDate ?? null });
  };

  const handleDateChange = (range: CalendarDateRange | undefined) => {
    setDateRange(range);

    if (!range?.from || !range?.to) {
      return;
    }

    setSelectedPreset('custom');
    onChange({ endDate: range.to, startDate: range.from });
    setOpen(false);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="inline-flex overflow-hidden rounded-lg border border-white/[0.08]">
        {PRESET_OPTIONS.map((preset, index) => (
          <Button
            key={preset}
            onClick={() => handlePresetChange(preset)}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'h-9 border-0 px-4 text-sm',
              index > 0 && 'border-l border-white/[0.08]',
              selectedPreset === preset
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-transparent text-white/80 hover:bg-white/5 hover:text-white',
            )}
            withWrapper={false}
          >
            {preset}
          </Button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              fieldControlClassName,
              'w-60 justify-start font-normal text-left',
              !dateRange && 'text-muted-foreground',
            )}
          >
            <HiCalendarDays className="mr-2 h-4 w-4" />
            {formatSelectedDateRange(dateRange)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn('w-auto p-0', fieldControlPopoverClassName)}
          align="end"
        >
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={handleDateChange}
            toDate={yesterday}
            numberOfMonths={2}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
