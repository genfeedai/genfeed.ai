'use client';

import { AlertCategory } from '@genfeedai/contracts';
import Alert from '@ui/feedback/alert/Alert';
import { useTranslations } from 'next-intl';

interface EconomicsReportErrorProps {
  error: unknown;
}

/** Shown in place of a report body when its request failed. */
export default function EconomicsReportError({
  error,
}: EconomicsReportErrorProps) {
  const translate = useTranslations('pages.adminEconomics');

  return (
    <Alert type={AlertCategory.ERROR}>
      {translate('loadFailed')}
      {error instanceof Error && error.message ? `: ${error.message}` : ''}
    </Alert>
  );
}
