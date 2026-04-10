'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SmartAlertsPanelProps } from '@genfeedai/props/analytics/insights.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import { memo, useMemo } from 'react';
import {
  HiArrowRight,
  HiBell,
  HiCheckCircle,
  HiExclamationTriangle,
  HiInformationCircle,
  HiSparkles,
  HiTrophy,
  HiXMark,
} from 'react-icons/hi2';

const getSeverityStyles = (
  severity: 'critical' | 'warning' | 'info' | 'success',
) => {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-error/10',
        border: 'border-error/30',
        icon: HiExclamationTriangle,
        text: 'text-error',
      };
    case 'warning':
      return {
        bg: 'bg-warning/10',
        border: 'border-warning/30',
        icon: HiExclamationTriangle,
        text: 'text-warning',
      };
    case 'success':
      return {
        bg: 'bg-success/10',
        border: 'border-success/30',
        icon: HiCheckCircle,
        text: 'text-success',
      };
    default:
      return {
        bg: 'bg-info/10',
        border: 'border-info/30',
        icon: HiInformationCircle,
        text: 'text-info',
      };
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'anomaly':
      return HiExclamationTriangle;
    case 'milestone':
      return HiTrophy;
    case 'trend':
      return HiSparkles;
    case 'opportunity':
      return HiSparkles;
    default:
      return HiBell;
  }
};

const SmartAlertsPanel = memo(function SmartAlertsPanel({
  alerts,
  isLoading = false,
  onMarkRead,
  onDismiss,
  onAction,
  className,
}: SmartAlertsPanelProps) {
  const activeAlerts = useMemo(() => {
    return alerts.filter((alert) => !alert.isDismissed);
  }, [alerts]);

  const unreadCount = useMemo(() => {
    return activeAlerts.filter((alert) => !alert.isRead).length;
  }, [activeAlerts]);

  if (isLoading) {
    return (
      <Card
        label="Smart Alerts"
        icon={HiBell}
        iconClassName="text-primary"
        className={className}
      >
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse flex items-start gap-3 p-3 bg-background"
            >
              <div className="w-8 h-8 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted w-3/4" />
                <div className="h-3 bg-muted w-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (activeAlerts.length === 0) {
    return (
      <Card
        label="Smart Alerts"
        icon={HiBell}
        iconClassName="text-primary"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HiCheckCircle className="w-12 h-12 text-success mb-3" />
          <p className="text-foreground/70 font-medium">All caught up!</p>
          <p className="text-sm text-foreground/50">
            No alerts require your attention
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="Smart Alerts"
      icon={HiBell}
      iconClassName="text-primary"
      description={
        unreadCount > 0
          ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`
          : 'All alerts read'
      }
      className={className}
    >
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {activeAlerts.map((alert) => {
          const styles = getSeverityStyles(alert.severity);
          const TypeIcon = getTypeIcon(alert.type);
          const SeverityIcon = styles.icon;

          return (
            <div
              key={alert.id}
              className={cn(
                'relative flex items-start gap-3 p-3 border transition-all',
                styles.bg,
                styles.border,
                !alert.isRead && 'ring-2 ring-offset-2 ring-primary/20',
              )}
              onClick={() => !alert.isRead && onMarkRead?.(alert.id)}
            >
              <div className={cn('mt-0.5', styles.text)}>
                <SeverityIcon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={cn(
                      'font-semibold text-sm',
                      !alert.isRead && 'text-foreground',
                      alert.isRead && 'text-foreground/70',
                    )}
                  >
                    {alert.title}
                  </span>
                  <TypeIcon className="w-3.5 h-3.5 text-foreground/40" />
                  {!alert.isRead && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>

                <p
                  className={cn(
                    'text-sm',
                    !alert.isRead ? 'text-foreground/80' : 'text-foreground/60',
                  )}
                >
                  {alert.message}
                </p>

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-foreground/40">
                    {formatDistanceToNow(new Date(alert.createdAt), {
                      addSuffix: true,
                    })}
                  </span>

                  {alert.actionUrl && alert.actionLabel && onAction && (
                    <Button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(alert.id);
                      }}
                      variant={ButtonVariant.UNSTYLED}
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium transition-colors',
                        styles.text,
                        'hover:underline',
                      )}
                    >
                      {alert.actionLabel}
                      <HiArrowRight className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {onDismiss && (
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(alert.id);
                  }}
                  variant={ButtonVariant.UNSTYLED}
                  className="p-1 rounded-full hover:bg-muted/50 transition-colors"
                  ariaLabel="Dismiss alert"
                >
                  <HiXMark className="w-4 h-4 text-foreground/40" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
});

export default SmartAlertsPanel;
