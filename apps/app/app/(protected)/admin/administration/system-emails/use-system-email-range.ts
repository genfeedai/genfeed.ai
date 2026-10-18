'use client';

import type { IEmailPerformanceQuery } from '@genfeedai/contracts/interfaces';
import { useState } from 'react';

const DAY_MS = 86_400_000;

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive UTC calendar days: `to` is the start of the day after `through`. */
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
  const [from, setFrom] = useState(() =>
    dateInputValue(new Date(Date.now() - 29 * DAY_MS)),
  );
  const [through, setThrough] = useState(() => dateInputValue(new Date()));
  const [query, setQuery] = useState(() => buildRangeQuery(from, through));

  const duration =
    new Date(through).getTime() - new Date(from).getTime() + DAY_MS;
  const isValidRange =
    Number.isFinite(duration) && duration > 0 && duration <= 90 * DAY_MS;

  function applyRange() {
    if (!isValidRange) return;
    setQuery(buildRangeQuery(from, through));
  }

  return {
    applyRange,
    from,
    isValidRange,
    query,
    setFrom,
    setThrough,
    through,
  };
}

export type SystemEmailRange = ReturnType<typeof useSystemEmailRange>;
export { DAY_MS, dateInputValue };
