import { createDateFromTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { Clock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Datepicker from './datepicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

interface DateTimeResult {
  date: string;
  time: string;
}

interface DateTimeDraft extends DateTimeResult {
  sourceKey: string;
}

export interface DateTimePickerProps {
  label?: string;
  value?: string | Date;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  timezone?: string;
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const EMPTY_DATETIME: DateTimeResult = { date: '', time: '' };

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    });
    dateFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getTimeFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = timeFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      timeZone: timezone,
    });
    timeFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function extractDateTimeFromISO(isoString: string): DateTimeResult | null {
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match || match.length < 6) {
    return null;
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  };
}

function extractDateTimeFromUTCDate(utcDate: Date): DateTimeResult {
  const year = utcDate.getUTCFullYear();
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getUTCDate()).padStart(2, '0');
  const hours = String(utcDate.getUTCHours()).padStart(2, '0');
  const minutes = String(utcDate.getUTCMinutes()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function extractDateTimeFromTimezone(
  utcDate: Date,
  timezone: string,
): DateTimeResult {
  const dateParts = getDateFormatter(timezone).formatToParts(utcDate);
  const timeParts = getTimeFormatter(timezone).formatToParts(utcDate);

  const year = dateParts.find((part) => part.type === 'year')?.value || '';
  const month = dateParts.find((part) => part.type === 'month')?.value || '';
  const day = dateParts.find((part) => part.type === 'day')?.value || '';
  const hour = timeParts.find((part) => part.type === 'hour')?.value || '';
  const minute = timeParts.find((part) => part.type === 'minute')?.value || '';

  return {
    date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
  };
}

function formatTimeDisplay(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function getDateTimeSourceKey(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'invalid-date' : value.toISOString();
  }

  return typeof value === 'string' ? value : '';
}

function padClock(value: number): string {
  return String(value).padStart(2, '0');
}

function wallClockInTimezone(
  date: Date,
  timezone: string | undefined,
): DateTimeResult {
  const displayTimezone = timezone || 'UTC';
  if (displayTimezone === 'UTC') {
    return extractDateTimeFromUTCDate(date);
  }

  try {
    return extractDateTimeFromTimezone(date, displayTimezone);
  } catch {
    return extractDateTimeFromUTCDate(date);
  }
}

function resolveDateTimeResult(
  value: string | Date | undefined,
  timezone: string | undefined,
): DateTimeResult {
  if (!value || value === '') {
    return EMPTY_DATETIME;
  }

  let isoString: string;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return EMPTY_DATETIME;
    }

    isoString = value.toISOString();
  } else if (typeof value === 'string') {
    isoString = value.trim();
  } else {
    return EMPTY_DATETIME;
  }

  const utcDate = new Date(isoString);
  if (Number.isNaN(utcDate.getTime())) {
    return EMPTY_DATETIME;
  }

  const displayTimezone = timezone || 'UTC';

  if (displayTimezone === 'UTC' || !timezone) {
    return (
      extractDateTimeFromISO(isoString) || extractDateTimeFromUTCDate(utcDate)
    );
  }

  try {
    return extractDateTimeFromTimezone(utcDate, displayTimezone);
  } catch {
    return (
      extractDateTimeFromISO(isoString) || extractDateTimeFromUTCDate(utcDate)
    );
  }
}

export default function DateTimePicker({
  label = '',
  value = '',
  onChange,
  minDate = new Date(),
  isRequired = false,
  isDisabled = false,
  className = '',
  helpText,
  timezone,
}: DateTimePickerProps) {
  const sourceKey = getDateTimeSourceKey(value);
  const derivedDateTime = useMemo(
    () => resolveDateTimeResult(value, timezone),
    [timezone, value],
  );
  const [draft, setDraft] = useState<DateTimeDraft>(() => ({
    ...derivedDateTime,
    sourceKey,
  }));
  const selectedDate =
    draft.sourceKey === sourceKey ? draft.date : derivedDateTime.date;
  const selectedTime =
    draft.sourceKey === sourceKey ? draft.time : derivedDateTime.time;

  const minWallClock = wallClockInTimezone(minDate || new Date(), timezone);

  const getMinDateString = () => minWallClock.date;

  const getMinTime = () => {
    if (!selectedDate || selectedDate !== minWallClock.date) {
      return '00:00';
    }

    const [hourText, minuteText] = minWallClock.time.split(':');
    const minutes = Number(minuteText);
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    let hours = Number(hourText);
    let finalMinutes = roundedMinutes;

    if (roundedMinutes === 60) {
      hours = (hours + 1) % 24;
      finalMinutes = 0;
    }

    return `${padClock(hours)}:${padClock(finalMinutes)}`;
  };

  const timeOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];
    const todayString = minWallClock.date;
    const isToday = selectedDate === todayString;

    let minTotalMinutes = 0;
    if (isToday) {
      const [hourText, minuteText] = minWallClock.time.split(':');
      const minutes = Number(minuteText);
      const roundedMinutes = Math.ceil(minutes / 15) * 15;
      let hours = Number(hourText);
      let finalMinutes = roundedMinutes;
      if (roundedMinutes === 60) {
        hours = (hours + 1) % 24;
        finalMinutes = 0;
      }
      minTotalMinutes = hours * 60 + finalMinutes;
    }

    let selectedTimeMinutes = -1;
    if (selectedTime) {
      const [selectedHour, selectedMinute] = selectedTime
        .split(':')
        .map(Number);
      selectedTimeMinutes = selectedHour * 60 + selectedMinute;
    }

    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const totalMinutes = hour * 60 + minute;

        if (
          isToday &&
          totalMinutes < minTotalMinutes &&
          totalMinutes !== selectedTimeMinutes
        ) {
          continue;
        }

        const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        options.push({
          label: formatTimeDisplay(hour, minute),
          value: timeString,
        });
      }
    }

    return options;
  }, [minWallClock.date, minWallClock.time, selectedDate, selectedTime]);

  const updateDateTime = useCallback(
    (dateString: string, timeString: string) => {
      if (!dateString || !timeString) {
        onChange(null);
        return;
      }

      const [year, month, day] = dateString.split('-').map(Number);
      const [hours, minutes] = timeString.split(':').map(Number);
      const displayTimezone = timezone || 'UTC';
      const requestedDate = `${year}-${padClock(month)}-${padClock(day)}`;
      const requestedTime = `${padClock(hours)}:${padClock(minutes)}`;

      let utcDate: Date;
      try {
        utcDate = createDateFromTimezone(
          year,
          month,
          day,
          hours,
          minutes,
          displayTimezone,
        );
      } catch {
        onChange(null);
        return;
      }

      const rendered = wallClockInTimezone(utcDate, displayTimezone);
      if (rendered.date !== requestedDate || rendered.time !== requestedTime) {
        onChange(null);
        return;
      }

      onChange(utcDate);
    },
    [onChange, timezone],
  );

  const timezoneRef = useRef(timezone);
  useEffect(() => {
    if (timezoneRef.current === timezone) {
      return;
    }

    timezoneRef.current = timezone;
    if (!selectedDate || !selectedTime) {
      return;
    }

    updateDateTime(selectedDate, selectedTime);
  }, [selectedDate, selectedTime, timezone, updateDateTime]);

  const handleDateChange = (next: Date | null) => {
    if (!next) {
      setDraft({ date: '', sourceKey, time: selectedTime });
      onChange(null);
      return;
    }

    const year = next.getFullYear();
    const month = String(next.getMonth() + 1).padStart(2, '0');
    const day = String(next.getDate()).padStart(2, '0');
    const nextDate = `${year}-${month}-${day}`;
    setDraft({ date: nextDate, sourceKey, time: selectedTime });

    if (!selectedTime) {
      onChange(null);
      return;
    }

    if (nextDate === getMinDateString()) {
      const minTime = getMinTime();
      if (selectedTime < minTime) {
        setDraft({ date: nextDate, sourceKey, time: minTime });
        updateDateTime(nextDate, minTime);
        return;
      }
    }

    updateDateTime(nextDate, selectedTime);
  };

  const handleTimeChange = (nextTime: string) => {
    setDraft({ date: selectedDate, sourceKey, time: nextTime });

    if (selectedDate && nextTime) {
      updateDateTime(selectedDate, nextTime);
      return;
    }

    if (!nextTime) {
      onChange(null);
    }
  };

  const zonedMinDate = useMemo(() => {
    const [year, month, day] = minWallClock.date.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }, [minWallClock.date]);

  const dateValue = selectedDate ? new Date(`${selectedDate}T12:00:00`) : null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label ? (
        <label className="block text-sm font-medium">
          {label}
          {timezone ? (
            <span className="ml-2 text-muted-foreground">({timezone})</span>
          ) : null}
          {isRequired ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Datepicker
          aria-label="Date"
          dateFormat="MMM d, yyyy"
          isDisabled={isDisabled}
          isRequired={isRequired}
          minDate={zonedMinDate}
          onChange={handleDateChange}
          placeholderText="Select date"
          value={dateValue}
        />

        <div className="flex min-w-0 flex-col gap-1">
          <Select
            disabled={isDisabled || !selectedDate}
            onValueChange={handleTimeChange}
            value={selectedTime || undefined}
          >
            <SelectTrigger
              aria-label="Time"
              className="h-10 w-full"
              disabled={isDisabled || !selectedDate}
            >
              <Clock className="mr-2 size-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
              {timeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {helpText ? (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      ) : null}
    </div>
  );
}
