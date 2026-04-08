'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@helpers/formatting/format/format.helper';
import type { AnomalyDetectionCardProps } from '@props/analytics/insights.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiExclamationTriangle,
  HiInformationCircle,
  HiXMark,
} from 'react-icons/hi2';

const getSeverityStyles = (severity: 'critical' | 'warning' | 'info') => {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-error/10',
        border: 'border-error/30',
        icon: 'text-error',
        text: 'text-error',
      };
    case 'warning':
      return {
        bg: 'bg-warning/10',
        border: 'border-warning/30',
        icon: 'text-warning',
        text: 'text-warning',
      };
    default:
      return {
        bg: 'bg-info/10',
        border: 'border-info/30',
        icon: 'text-info',
        text: 'text-info',
      };
  }
};

const AnomalyDetectionCard = memo(function AnomalyDetectionCard({
  anomalies,
  isLoading = false,
  onDismiss,
  className,
}: AnomalyDetectionCardProps) {
  if (isLoading) {
    return (
      <Card
        label="Anomaly Detection"
        icon={HiExclamationTriangle}
        iconClassName="text-warning"
        className={className}
      >
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse flex items-center gap-4 p-4 bg-background"
            >
              <div className="w-10 h-10 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted w-3/4" />
                <div className="h-3 bg-muted w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (anomalies.length === 0) {
    return (
      <Card
        label="Anomaly Detection"
        icon={HiExclamationTriangle}
        iconClassName="text-warning"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HiInformationCircle className="w-12 h-12 text-success mb-3" />
          <p className="text-foreground/70 font-medium">
            No anomalies detected
          </p>
          <p className="text-sm text-foreground/50">
            Your metrics are performing within expected ranges
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="Anomaly Detection"
      icon={HiExclamationTriangle}
      iconClassName="text-warning"
      description={`${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected`}
      className={className}
    >
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {anomalies.map((anomaly) => {
          const styles = getSeverityStyles(anomaly.severity);
          const isNegative = anomaly.deviation < 0;

          return (
            <div
              key={anomaly.id}
              className={cn(
                'relative flex items-start gap-4 p-4 border',
                styles.bg,
                styles.border,
              )}
            >
              <div className={cn('mt-0.5', styles.icon)}>
                {isNegative ? (
                  <HiArrowTrendingDown className="w-6 h-6" />
                ) : (
                  <HiArrowTrendingUp className="w-6 h-6" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground capitalize">
                    {anomaly.metric}
                  </span>
                  {anomaly.platform && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/70">
                      {anomaly.platform}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium uppercase',
                      styles.bg,
                      styles.text,
                    )}
                  >
                    {anomaly.severity}
                  </span>
                </div>

                <p className="text-sm text-foreground/70 mb-2">
                  {anomaly.description}
                </p>

                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-foreground/50">Current: </span>
                    <span className="font-mono font-medium">
                      {formatCompactNumberIntl(anomaly.currentValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-foreground/50">Expected: </span>
                    <span className="font-mono font-medium">
                      {formatCompactNumberIntl(anomaly.expectedValue)}
                    </span>
                  </div>
                  <div className={cn('font-mono font-medium', styles.text)}>
                    {formatPercentage(anomaly.deviation)}
                  </div>
                </div>
              </div>

              {onDismiss && (
                <Button
                  type="button"
                  onClick={() => onDismiss(anomaly.id)}
                  variant={ButtonVariant.UNSTYLED}
                  className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 transition-colors"
                  ariaLabel="Dismiss anomaly"
                >
                  <HiXMark className="w-4 h-4 text-foreground/50" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
});

export default AnomalyDetectionCard;
