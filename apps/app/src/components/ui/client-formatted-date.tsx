'use client';

import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';

type DateInput = Date | number | string;

interface ClientFormattedDateProps {
  className?: string;
  fallback?: string;
  format?: 'date' | 'dateTime' | 'relative';
  locales?: Intl.LocalesArgument;
  options?: Intl.DateTimeFormatOptions;
  value?: DateInput | 'now' | null;
}

function formatDateValue({
  fallback = '',
  format = 'dateTime',
  locales,
  options,
  value,
}: ClientFormattedDateProps): string {
  if (!value) {
    return fallback;
  }

  const date = value === 'now' ? new Date() : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  if (format === 'relative') {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (format === 'date') {
    return date.toLocaleDateString(locales, options);
  }

  return date.toLocaleString(locales, options);
}

export function ClientFormattedDate(props: ClientFormattedDateProps) {
  const { className, fallback = '', format, locales, options, value } = props;
  const [formatted, setFormatted] = useState(fallback);

  useEffect(() => {
    setFormatted(
      formatDateValue({ fallback, format, locales, options, value }),
    );
  }, [fallback, format, locales, options, value]);

  return <span className={className}>{formatted}</span>;
}
