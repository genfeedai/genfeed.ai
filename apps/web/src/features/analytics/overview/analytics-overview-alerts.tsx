'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Alert } from '@ui/primitives/alert';
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">{healthAlertMessage}</div>
              {healthCheckedAt && (
                <div className="text-xs text-foreground/70">
                  Last checked {format(new Date(healthCheckedAt), 'PPpp')}
                </div>
              )}
            </div>
            <Button
              label="Retry checks"
              variant={ButtonVariant.SECONDARY}
              onClick={runHealthChecks}
            />
          </div>
        </Alert>
      )}

      {isUsingAnyCache && (
        <Alert variant="warning">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">
                Live analytics are temporarily unavailable.
              </div>
              <div className="text-xs text-foreground/70">
                Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}.
              </div>
            </div>
            <Button
              label="Retry data"
              variant={ButtonVariant.SECONDARY}
              onClick={retryAllData}
            />
          </div>
        </Alert>
      )}

      {hasAnalyticsError && !isUsingAnyCache && (
        <Alert variant="destructive">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">Analytics failed to load.</div>
              <div className="text-xs text-foreground/70">
                Please retry or check service status.
              </div>
            </div>
            <Button
              label="Retry analytics"
              variant={ButtonVariant.SECONDARY}
              onClick={retryAllData}
            />
          </div>
        </Alert>
      )}
    </>
  );
}
