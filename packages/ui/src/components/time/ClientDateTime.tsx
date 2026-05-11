'use client';

import { useEffect, useState } from 'react';

export interface ClientDateTimeProps {
  fallback?: string;
  format?: (date: Date) => string;
  prefix?: string;
  value?: Date | number | string;
}

const formatDefaultDateTime = (date: Date) => date.toLocaleString();

export default function ClientDateTime({
  fallback = '',
  format = formatDefaultDateTime,
  prefix = '',
  value,
}: ClientDateTimeProps) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    const date = value === undefined ? new Date() : new Date(value);

    if (Number.isNaN(date.getTime())) {
      setLabel(fallback);
      return;
    }

    setLabel(`${prefix}${format(date)}`);
  }, [fallback, format, prefix, value]);

  return <>{label}</>;
}
