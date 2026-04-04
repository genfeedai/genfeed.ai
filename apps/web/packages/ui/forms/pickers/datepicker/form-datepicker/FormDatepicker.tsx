'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormDatepickerProps } from '@props/forms/form.props';
import FormControl from '@ui/forms/base/form-control/FormControl';
import { Button } from '@ui/primitives/button';
import { Calendar } from '@ui/primitives/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { format } from 'date-fns';
import { useState } from 'react';
import { HiCalendarDays } from 'react-icons/hi2';

function parseDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === 'string' ? new Date(value) : value;
}

export default function FormDatepicker({
  label,
  value,
  onChange,
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
}: FormDatepickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);

  const handleSelect = (date: Date | undefined) => {
    onChange(date ?? null);
    setOpen(false);
  };

  return (
    <FormControl label={label} isRequired={isRequired}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.OUTLINE}
            disabled={isDisabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !selectedDate && 'text-muted-foreground',
              className,
            )}
          >
            <HiCalendarDays className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, dateFormat) : placeholderText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            fromDate={minDate}
            toDate={maxDate}
            captionLayout={
              showYearDropdown && showMonthDropdown ? 'dropdown' : 'label'
            }
            disabled={isDisabled}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {helpText && (
        <p className="text-xs text-foreground/70 mt-1">{helpText}</p>
      )}
    </FormControl>
  );
}
