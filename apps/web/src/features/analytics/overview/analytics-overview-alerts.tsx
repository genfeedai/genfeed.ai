'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';

type AnalyticsOverviewAlertsProps = {
  cachedLabel: string;
  hasAnalyticsError: boolean;
  healthAlertMessage: string | null;
  healthCheckedAt: string | null;
  isUsingAnyCache: boolean;
  retryAllData: () => void;
  runHealthChecks: () => void;
};

export default function AnalyticsOverviewAlerts({
  cachedLabel,
  hasAnalyticsError,
  healthAlertMessage,
  healthCheckedAt,
  isUsingAnyCache,
  retryAllData,
  runHealthChecks,
}: AnalyticsOverviewAlertsProps) {
  return (
    <>
      {healthAlertMessage && (
        <Alert variant="warning">
          <AlertTitle>{healthAlertMessage}</AlertTitle>
          {healthCheckedAt && (
            <AlertDescription>
              Last checked {format(new Date(healthCheckedAt), 'PPpp')}
            </AlertDescription>
          )}
          <AlertActions>
            <Button
              label="Retry checks"
              variant={ButtonVariant.SECONDARY}
              onClick={runHealthChecks}
            />
          </AlertActions>
        </Alert>
      )}

      {isUsingAnyCache && (
        <Alert variant="warning">
          <AlertTitle>Live analytics are temporarily unavailable.</AlertTitle>
          <AlertDescription>
            Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}.
          </AlertDescription>
          <AlertActions>
            <Button
              label="Retry data"
              variant={ButtonVariant.SECONDARY}
              onClick={retryAllData}
            />
          </AlertActions>
        </Alert>
      )}

      {hasAnalyticsError && !isUsingAnyCache && (
        <Alert variant="destructive">
          <AlertTitle>Analytics failed to load.</AlertTitle>
          <AlertDescription>
            Please retry or check service status.
          </AlertDescription>
          <AlertActions>
            <Button
              label="Retry analytics"
              variant={ButtonVariant.SECONDARY}
              onClick={retryAllData}
            />
          </AlertActions>
        </Alert>
      )}
    </>
  );
}
