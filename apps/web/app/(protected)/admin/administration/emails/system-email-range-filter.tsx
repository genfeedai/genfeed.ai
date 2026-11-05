'use client';

import DateRangePicker from '@ui/primitives/date-range-picker';
import { useTranslations } from 'next-intl';
import {
  SYSTEM_EMAIL_DEFAULT_PRESET,
  type SystemEmailRange,
} from './use-system-email-range';

/** The report's date range, rendered in the admin subbar like the analytics pages. */
export default function SystemEmailRangeFilter({
  range,
}: {
  range: SystemEmailRange;
}) {
  const translate = useTranslations('pages.systemEmailPerformance');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {!range.isValidRange && (
        <p role="alert" className="text-sm text-destructive">
          {translate('invalidRange')}
        </p>
      )}
      <DateRangePicker
        onChange={range.setRange}
        defaultPreset={SYSTEM_EMAIL_DEFAULT_PRESET}
      />
    </div>
  );
}
