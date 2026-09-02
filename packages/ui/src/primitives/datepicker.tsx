'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';
import { Calendar } from './calendar';
import Field from './field';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatepickerProps {
  label?: string;
  value?: string | Date | null;
  onChange?: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  placeholderText?: string;
  dateFormat?: string;
  showYearDropdown?: boolean;
  showMonthDropdown?: boolean;
  dropdownMode?: 'scroll' | 'select';
  /** Accessible name when no visible `label` is rendered. */
  'aria-label'?: string;
}

function parseDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? new Date(value) : value;
}

/**
 * react-day-picker only builds year options between startMonth and endMonth.
 * With captionLayout="dropdown" and no bounds it defaults to "100 years ago
 * → end of this year", which blocks scheduling into next year. Prefer caller
 * min/max; otherwise open a wide navigation window.
 */
function resolveNavigationBounds(
  minDate: Date | undefined,
  maxDate: Date | undefined,
): { startMonth: Date; endMonth: Date } {
  const now = new Date();
  return {
    endMonth: maxDate ?? new Date(now.getFullYear() + 10, 11, 31),
    startMonth: minDate ?? new Date(now.getFullYear() - 100, 0, 1),
  };
}

export default function Datepicker({
  label,
  value = null,
  onChange = () => {},
  minDate,
  maxDate,
  isRequired = false,
  isDisabled = false,
  className = '',
  helpText,
  placeholderText = 'Select date',
  dateFormat = 'PPP',
  showYearDropdown = true,
  showMonthDropdown = true,
  'aria-label': ariaLabel,
}: DatepickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);
  const disabledDays = [
    minDate ? { before: minDate } : null,
    maxDate ? { after: maxDate } : null,
  ].filter((matcher): matcher is { before: Date } | { after: Date } =>
    Boolean(matcher),
  );
  const { endMonth, startMonth } = resolveNavigationBounds(minDate, maxDate);
  const hasMonthAndYearDropdowns = showYearDropdown && showMonthDropdown;
  const captionLayout = hasMonthAndYearDropdowns
    ? 'dropdown'
    : showYearDropdown
      ? 'dropdown-years'
      : showMonthDropdown
        ? 'dropdown-months'
        : 'label';

  const handleSelect = (date: Date | undefined) => {
    onChange(date ?? null);
    setOpen(false);
  };

  return (
    <Field label={label} isRequired={isRequired} helpText={helpText}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.SECONDARY}
            disabled={isDisabled}
            ariaLabel={ariaLabel}
            className={cn(
              'w-full justify-start text-left font-normal',
              !selectedDate && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {selectedDate ? format(selectedDate, dateFormat) : placeholderText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            startMonth={startMonth}
            endMonth={endMonth}
            captionLayout={captionLayout}
            disabled={isDisabled || disabledDays}
            defaultMonth={selectedDate}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
