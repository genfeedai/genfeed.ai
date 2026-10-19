'use client';

import { Timeframe } from '@genfeedai/contracts';
import type { IEmailPerformanceQuery } from '@genfeedai/contracts/interfaces';
import type { DateRange } from '@genfeedai/contracts/interfaces/utils/date.interface';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { useState } from 'react';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;

/** Matches the shared DateRangePicker's default preset: 30 days ending yesterday. */
export const SYSTEM_EMAIL_DEFAULT_PRESET = Timeframe.D30;

function dateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Inclusive calendar days: `to` is the start of the day after `through`. */
function buildRangeQuery(
  from: string,
  through: string,
): IEmailPerformanceQuery {
  return {
    from: `${from}T00:00:00.000Z`,
    to: new Date(
      new Date(`${through}T00:00:00.000Z`).getTime() + DAY_MS,
    ).toISOString(),
  };
}

export function useSystemEmailRange() {
  const [isValidRange, setIsValidRange] = useState(true);
  const [query, setQuery] = useState(() => {
    const yesterday = subDays(new Date(), 1);

    return buildRangeQuery(
      dateInputValue(subDays(yesterday, DEFAULT_RANGE_DAYS - 1)),
      dateInputValue(yesterday),
    );
  });

  function setRange({ startDate, endDate }: DateRange) {
    if (!startDate || !endDate) {
      return;
    }

    const days = differenceInCalendarDays(endDate, startDate) + 1;
    const isValid = days >= 1 && days <= MAX_RANGE_DAYS;
    setIsValidRange(isValid);

    if (isValid) {
      setQuery(
        buildRangeQuery(dateInputValue(startDate), dateInputValue(endDate)),
      );
    }
  }

  return { isValidRange, query, setRange };
}

export type SystemEmailRange = ReturnType<typeof useSystemEmailRange>;
