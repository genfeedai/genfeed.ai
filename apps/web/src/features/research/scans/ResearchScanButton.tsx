'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ResearchScanStatus } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Radar } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * Starts one scan. It is off while a scan runs and while the library has none
 * left; the tooltip then says when the next one opens.
 */
export default function ResearchScanButton({
  isScanning,
  onScan,
  status,
}: {
  isScanning: boolean;
  onScan: () => void;
  status: ResearchScanStatus | undefined;
}) {
  const translate = useTranslations('pages.researchScans.scan');
  const format = useFormatter();
  const isOutOfScans = status?.remaining === 0;
  const tooltip =
    isOutOfScans && status?.nextAvailableAt
      ? translate('disabled', {
          when: format.dateTime(new Date(status.nextAvailableAt), {
            hour: 'numeric',
            minute: '2-digit',
            weekday: 'short',
          }),
        })
      : undefined;

  return (
    <Button
      data-testid="research-scan-button"
      icon={<Radar className="size-4" />}
      isDisabled={isOutOfScans}
      isLoading={isScanning}
      onClick={onScan}
      size={ButtonSize.SM}
      variant={ButtonVariant.SECONDARY}
      {...(tooltip ? { tooltip } : {})}
    >
      {isScanning ? translate('starting') : translate('action')}
    </Button>
  );
}
