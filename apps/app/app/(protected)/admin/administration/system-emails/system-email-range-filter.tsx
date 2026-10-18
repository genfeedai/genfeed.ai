'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { SystemEmailRange } from './use-system-email-range';

/** The report's UTC date range, rendered in the admin subbar. */
export default function SystemEmailRangeFilter({
  range,
}: {
  range: SystemEmailRange;
}) {
  const translate = useTranslations('pages.systemEmailPerformance');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        label={translate('from')}
        type="date"
        value={range.from}
        onChange={(event) => range.setFrom(event.target.value)}
      />
      <Input
        label={translate('through')}
        type="date"
        value={range.through}
        onChange={(event) => range.setThrough(event.target.value)}
      />
      <Button
        label={translate('applyDates')}
        variant={ButtonVariant.SECONDARY}
        isDisabled={!range.isValidRange}
        onClick={range.applyRange}
      />
      {!range.isValidRange && (
        <p role="alert" className="text-sm text-destructive">
          {translate('invalidRange')}
        </p>
      )}
    </div>
  );
}
