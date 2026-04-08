'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { format } from 'date-fns';
import { useState } from 'react';
import { HiCalendarDays } from 'react-icons/hi2';
import { cn } from '../lib/utils';
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
}

function parseDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? new Date(value) : value;
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
}: DatepickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);

  const handleSelect = (date: Date | undefined) => {
    onChange(date ?? null);
    setOpen(false);
  };

  return (
    <Field label={label} isRequired={isRequired} helpText={helpText}>
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
    </Field>
  );
}
