import { createDateFromTimezone } from '@helpers/formatting/timezone/timezone.helper';
import type { FormDateTimePickerProps } from '@props/forms/form.props';
import { logger } from '@services/core/logger.service';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { HiCalendar, HiClock } from 'react-icons/hi2';

interface DateTimeResult {
  date: string;
  time: string;
}

function extractDateTimeFromISO(isoString: string): DateTimeResult | null {
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (match && match.length >= 6) {
    return {
      date: `${match[1]}-${match[2]}-${match[3]}`,
      time: `${match[4]}:${match[5]}`,
    };
  }
  return null;
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

  const year = dateParts.find((p) => p.type === 'year')?.value || '';
  const month = dateParts.find((p) => p.type === 'month')?.value || '';
  const day = dateParts.find((p) => p.type === 'day')?.value || '';
  const hour = timeParts.find((p) => p.type === 'hour')?.value || '';
  const minute = timeParts.find((p) => p.type === 'minute')?.value || '';

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

export default function FormDateTimePicker({
  label = '',
  value = '',
  onChange,
  minDate = new Date(),
  isRequired = false,
  isDisabled = false,
  className = '',
  helpText,
  timezone,
}: FormDateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Initialize from value prop
  useEffect(() => {
    // Clear state if value is empty or null
    if (!value || value === '') {
      setSelectedDate('');
      setSelectedTime('');
      return;
    }

    // Convert Date objects to ISO string first to avoid timezone issues
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
      } catch (error: unknown) {
        logger.error('Error converting timezone', {
          error,
          timezone: displayTimezone,
        });
        result =
          extractDateTimeFromISO(isoString) ||
          extractDateTimeFromUTCDate(utcDate);
      }
    }

    setSelectedDate((prev) => (prev !== result.date ? result.date : prev));
    setSelectedTime((prev) => (prev !== result.time ? result.time : prev));
  }, [value, timezone]);

  // Get minimum date string for the date input
  const getMinDateString = () => {
    const now = minDate || new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get minimum time if selected date is today
  const getMinTime = () => {
    if (!selectedDate) {
      return '00:00';
    }

    const now = minDate || new Date();
    const todayString = getMinDateString();

    if (selectedDate === todayString) {
      // Round up to next 15-minute interval from minDate
      // If minDate is already on a 15-minute boundary, use it directly
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();

      // If already on a 15-minute boundary with no seconds/milliseconds, use it directly
      if (minutes % 15 === 0 && seconds === 0 && milliseconds === 0) {
        return `${String(now.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }

      // Otherwise, round up to next 15-minute interval
      const roundedMinutes = Math.ceil(minutes / 15) * 15;

      let hours = now.getHours();
      let finalMinutes = roundedMinutes;

      if (roundedMinutes === 60) {
        hours = (hours + 1) % 24;
        finalMinutes = 0;
      }

      return `${String(hours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
    }

    return '00:00';
  };

  // Generate time options with 15-minute intervals
  const generateTimeOptions = () => {
    const options = [];
    const minTime = getMinTime();
    const [minHour, minMinute] = minTime.split(':').map(Number);
    const minTotalMinutes = minHour * 60 + minMinute;
    const isToday = selectedDate === getMinDateString();

    let selectedTimeMinutes = -1;
    if (selectedTime) {
      const [selHour, selMin] = selectedTime.split(':').map(Number);
      selectedTimeMinutes = selHour * 60 + selMin;
    }

    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const totalMinutes = hour * 60 + minute;

        // Skip times before minimum if on same day, UNLESS it's the selected time
        if (
          isToday &&
          totalMinutes < minTotalMinutes &&
          totalMinutes !== selectedTimeMinutes
        ) {
          continue;
        }

        const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const displayTime = formatTimeDisplay(hour, minute);
        options.push(
          <option key={timeString} value={timeString}>
            {displayTime}
          </option>,
        );
      }
    }

    return options;
  };

  // Handle date change
  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);

    // If time is already selected, update the combined date-time
    // Otherwise, just update the date and wait for time selection
    if (selectedTime) {
      // If the new date is today and selected time is before minimum, reset time
      if (newDate === getMinDateString()) {
        const minTime = getMinTime();
        if (selectedTime < minTime) {
          setSelectedTime(minTime);
          return updateDateTime(newDate, minTime);
        }
      }
      // Both date and time are set, merge them
      updateDateTime(newDate, selectedTime);
    } else {
      // Only date is set, don't merge yet - wait for time selection
      // Clear any existing value since we don't have both date and time
      onChange(null);
    }
  };

  // Handle time change
  const handleTimeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newTime = e.target.value;
    setSelectedTime(newTime);
    // Only merge and update if both date and time are selected
    if (selectedDate && newTime) {
      updateDateTime(selectedDate, newTime);
    } else if (!newTime) {
      // Time was cleared, clear the combined value
      onChange(null);
    }
  };

  // Update the parent component with the combined date-time
  const updateDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) {
      return onChange(null);
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
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
        {/* Date Input */}
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

        {/* Time Select */}
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
