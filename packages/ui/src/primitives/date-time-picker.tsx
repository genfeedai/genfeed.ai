import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { HiCalendar, HiClock } from 'react-icons/hi2';

interface DateTimeResult {
  date: string;
  time: string;
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

const DATETIME_PARTS_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
};

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
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: timezone,
  });

  const dateParts = dateFormatter.formatToParts(utcDate);
  const timeParts = timeFormatter.formatToParts(utcDate);

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

function createDateFromTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string = 'UTC',
): Date {
  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, hours, minutes));
  }

  const baseUtcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...DATETIME_PARTS_FORMAT,
    timeZone: timezone,
  });

  const parts = formatter.formatToParts(baseUtcDate);
  const getPartValue = (type: string) =>
    parseInt(parts.find((part) => part.type === type)?.value || '0', 10);

  const formattedYear = getPartValue('year');
  const formattedMonth = getPartValue('month');
  const formattedDay = getPartValue('day');
  const formattedHour = getPartValue('hour');
  const formattedMinute = getPartValue('minute');

  const desiredDate = new Date(Date.UTC(year, month - 1, day));
  const formattedDate = new Date(
    Date.UTC(formattedYear, formattedMonth - 1, formattedDay),
  );
  const dayDiffMs = desiredDate.getTime() - formattedDate.getTime();

  const desiredTotalMinutes = hours * 60 + minutes;
  const formattedTotalMinutes = formattedHour * 60 + formattedMinute;
  const timeDiffMs = (desiredTotalMinutes - formattedTotalMinutes) * 60 * 1000;

  return new Date(baseUtcDate.getTime() + dayDiffMs + timeDiffMs);
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
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  useEffect(() => {
    if (!value || value === '') {
      setSelectedDate('');
      setSelectedTime('');
      return;
    }

    let isoString: string;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        setSelectedDate('');
        setSelectedTime('');
        return;
      }

      isoString = value.toISOString();
    } else if (typeof value === 'string') {
      isoString = value.trim();
    } else {
      setSelectedDate('');
      setSelectedTime('');
      return;
    }

    const utcDate = new Date(isoString);
    if (Number.isNaN(utcDate.getTime())) {
      setSelectedDate('');
      setSelectedTime('');
      return;
    }

    const displayTimezone = timezone || 'UTC';
    let result: DateTimeResult;

    if (displayTimezone === 'UTC' || !timezone) {
      result =
        extractDateTimeFromISO(isoString) ||
        extractDateTimeFromUTCDate(utcDate);
    } else {
      try {
        result = extractDateTimeFromTimezone(utcDate, displayTimezone);
      } catch {
        result =
          extractDateTimeFromISO(isoString) ||
          extractDateTimeFromUTCDate(utcDate);
      }
    }

    setSelectedDate((previous) =>
      previous !== result.date ? result.date : previous,
    );
    setSelectedTime((previous) =>
      previous !== result.time ? result.time : previous,
    );
  }, [value, timezone]);

  const getMinDateString = () => {
    const now = minDate || new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getMinTime = () => {
    if (!selectedDate) {
      return '00:00';
    }

    const now = minDate || new Date();
    const todayString = getMinDateString();

    if (selectedDate !== todayString) {
      return '00:00';
    }

    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    if (minutes % 15 === 0 && seconds === 0 && milliseconds === 0) {
      return `${String(now.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    let hours = now.getHours();
    let finalMinutes = roundedMinutes;

    if (roundedMinutes === 60) {
      hours = (hours + 1) % 24;
      finalMinutes = 0;
    }

    return `${String(hours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
  };

  const generateTimeOptions = () => {
    const options = [];
    const minTime = getMinTime();
    const [minHour, minMinute] = minTime.split(':').map(Number);
    const minTotalMinutes = minHour * 60 + minMinute;
    const isToday = selectedDate === getMinDateString();

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
        options.push(
          <option key={timeString} value={timeString}>
            {formatTimeDisplay(hour, minute)}
          </option>,
        );
      }
    }

    return options;
  };

  const updateDateTime = (dateString: string, timeString: string) => {
    if (!dateString || !timeString) {
      onChange(null);
      return;
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);
    const displayTimezone = timezone || 'UTC';

    const utcDate = createDateFromTimezone(
      year,
      month,
      day,
      hours,
      minutes,
      displayTimezone,
    );

    onChange(utcDate);
  };

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDate = event.target.value;
    setSelectedDate(nextDate);

    if (!selectedTime) {
      onChange(null);
      return;
    }

    if (nextDate === getMinDateString()) {
      const minTime = getMinTime();
      if (selectedTime < minTime) {
        setSelectedTime(minTime);
        updateDateTime(nextDate, minTime);
        return;
      }
    }

    updateDateTime(nextDate, selectedTime);
  };

  const handleTimeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTime = event.target.value;
    setSelectedTime(nextTime);

    if (selectedDate && nextTime) {
      updateDateTime(selectedDate, nextTime);
      return;
    }

    if (!nextTime) {
      onChange(null);
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium mb-1 block">
          {label}
          {timezone && (
            <span className="text-foreground/50 ml-2">({timezone})</span>
          )}
          {isRequired && <span className="text-error ml-1">*</span>}
        </label>
      )}

      <div className="flex gap-4">
        <div className="relative flex-1">
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            min={getMinDateString()}
            disabled={isDisabled}
            required={isRequired}
            className="h-10 border border-input px-3 w-full pr-10"
          />
          <HiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 pointer-events-none" />
        </div>

        <div className="relative flex-1">
          <select
            value={selectedTime || ''}
            onChange={handleTimeChange}
            disabled={isDisabled || !selectedDate}
            required={isRequired}
            className="h-10 border border-input px-3 w-full pr-10 bg-background"
          >
            <option value="">Select time</option>
            {selectedDate && generateTimeOptions()}
          </select>
          <HiClock className="absolute right-8 top-1/2 -translate-y-1/2 text-foreground/50 pointer-events-none" />
        </div>
      </div>

      {helpText && (
        <p className="text-xs text-foreground/70 mt-1">{helpText}</p>
      )}
    </div>
  );
}
