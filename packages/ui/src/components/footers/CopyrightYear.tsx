'use client';

import ClientDateTime from '@ui/components/time/ClientDateTime';

export interface CopyrightYearProps {
  /** The year at render time, so the server HTML already shows one. */
  fallback: string;
}

const formatYear = (date: Date) => date.getFullYear().toString();

/**
 * The footer is a server component and cannot hand `ClientDateTime` a format
 * function, so this island owns it. A page cached across New Year updates to
 * the visitor's year after hydration.
 */
export default function CopyrightYear({ fallback }: CopyrightYearProps) {
  return <ClientDateTime fallback={fallback} format={formatYear} />;
}
