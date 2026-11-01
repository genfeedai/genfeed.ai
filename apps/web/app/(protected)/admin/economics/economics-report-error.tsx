'use client';

import { Alert } from '@ui/primitives/alert';
import { useTranslations } from 'next-intl';
import type { EconomicsReportErrorProps } from '@/features/admin/props/economics.props';

/** Shown in place of a report body when its request failed. */
export default function EconomicsReportError({
  error,
}: EconomicsReportErrorProps) {
  const translate = useTranslations('pages.adminEconomics');

  return (
    <Alert variant="destructive">
      {translate('loadFailed')}
      {error instanceof Error && error.message ? `: ${error.message}` : ''}
    </Alert>
  );
}
