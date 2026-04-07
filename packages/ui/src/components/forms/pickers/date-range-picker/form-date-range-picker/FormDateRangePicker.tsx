'use client';

import { ButtonVariant, Timeframe } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormDateRangePickerProps } from '@props/forms/form.props';
import Button from '@ui/buttons/base/Button';
import { Button as ShadcnButton } from '@ui/primitives/button';
import { Calendar } from '@ui/primitives/calendar';
import {
  fieldControlClassName,
  fieldControlPopoverClassName,
} from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { format, subDays } from 'date-fns';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { HiCalendarDays } from 'react-icons/hi2';

const PRESET_OPTIONS = [Timeframe.D7, Timeframe.D30, Timeframe.D90] as const;

export default function FormDateRangePicker({
  onChange,
  defaultPreset = Timeframe.D7,
  className = '',
}: FormDateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<
    Timeframe.D7 | Timeframe.D30 | Timeframe.D90 | 'custom'
  >(defaultPreset);
  const [open, setOpen] = useState(false);

  const yesterday = subDays(new Date(), 1);
  const getStartDate = (
    preset: Timeframe.D7 | Timeframe.D30 | Timeframe.D90 | 'custom',
  ) => {
    if (preset === 'custom') {
      return undefined;
    }
    const daysMap = {
      [Timeframe.D7]: 7,
      [Timeframe.D30]: 30,
      [Timeframe.D90]: 90,
    } as const;
    return subDays(yesterday, daysMap[preset] - 1);
  };

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: getStartDate(defaultPreset),
    to: yesterday,
  });

  const handlePresetChange = (
    preset: Timeframe.D7 | Timeframe.D30 | Timeframe.D90,
  ) => {
    setSelectedPreset(preset);
    const newStartDate = getStartDate(preset);
    const newEndDate = yesterday;
    setDateRange({ from: newStartDate, to: newEndDate });
    onChange({ endDate: newEndDate, startDate: newStartDate ?? null });
  };

  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setSelectedPreset('custom');
      onChange({ endDate: range.to, startDate: range.from });
      setOpen(false);
    }
  };

  const formatDateRange = () => {
    if (!dateRange?.from) {
      return 'Select dates';
    }
    if (!dateRange.to) {
      return format(dateRange.from, 'MMM d, yyyy');
    }
    return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Preset Buttons */}
      <div className="inline-flex overflow-hidden rounded-lg border border-white/[0.08]">
        {PRESET_OPTIONS.map((preset, index) => (
          <Button
            key={preset}
            onClick={() => handlePresetChange(preset)}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'h-9 rounded-none border-0 px-4 text-sm',
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

      {/* Custom Date Range Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ShadcnButton
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              fieldControlClassName,
              'w-60 justify-start font-normal text-left',
              !dateRange && 'text-muted-foreground',
            )}
          >
            <HiCalendarDays className="mr-2 h-4 w-4" />
            {formatDateRange()}
          </ShadcnButton>
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
