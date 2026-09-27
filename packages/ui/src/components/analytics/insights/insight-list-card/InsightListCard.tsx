'use client';

import { ButtonVariant, InsightImpact } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { InsightListCardProps } from '@genfeedai/props/analytics/insights.props';
import Card from '@ui/card/Card';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import { Badge, type BadgeProps } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import { Lightbulb, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

const IMPACT_BADGE_VARIANT: Record<InsightImpact, BadgeProps['variant']> = {
  [InsightImpact.HIGH]: 'warning',
  [InsightImpact.MEDIUM]: 'info',
  [InsightImpact.LOW]: 'secondary',
};

const InsightListCard = memo(function InsightListCard({
  insights,
  isLoading = false,
  onMarkRead,
  onDismiss,
  className,
}: InsightListCardProps) {
  const translate = useTranslations('ui.insightListCard');
  const unreadCount = useMemo(
    () => insights.filter((insight) => !insight.isRead).length,
    [insights],
  );

  if (isLoading) {
    return (
      <Card
        data-testid="insight-list-card"
        label={translate('title')}
        icon={Lightbulb}
        iconClassName="text-warning"
        className={className}
      >
        <div className="space-y-3">
          {[1, 2, 3].map((placeholderId) => (
            <div
              key={placeholderId}
              className="animate-pulse flex items-start gap-3 p-3 bg-background"
            >
              <div className="size-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted" />
                <div className="h-3 w-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card
        data-testid="insight-list-card"
        label={translate('title')}
        icon={Lightbulb}
        iconClassName="text-warning"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Lightbulb className="size-12 text-foreground/30 mb-3" />
          <p className="text-foreground/70 font-medium">
            {translate('emptyTitle')}
          </p>
          <p className="text-sm text-foreground/50">
            {translate('emptyDescription')}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      data-testid="insight-list-card"
      label={translate('title')}
      icon={Lightbulb}
      iconClassName="text-warning"
      description={
        unreadCount > 0
          ? translate('unreadCount', { count: unreadCount })
          : translate('allRead')
      }
      className={className}
    >
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              'relative flex items-start gap-3 p-3 border border-border bg-background transition-[box-shadow]',
              !insight.isRead &&
                'ring-2 ring-offset-2 ring-offset-background ring-primary/20',
            )}
          >
            <Button
              tabIndex={insight.isRead ? -1 : 0}
              className="flex-1 min-w-0 text-left"
              onClick={() => !insight.isRead && onMarkRead?.(insight.id)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={cn(
                    'font-semibold text-sm',
                    !insight.isRead && 'text-foreground',
                    insight.isRead && 'text-foreground/70',
                  )}
                >
                  {insight.title}
                </span>
                <Badge variant={IMPACT_BADGE_VARIANT[insight.impact]}>
                  {insight.impact}
                </Badge>
                {!insight.isRead && (
                  <span className="size-2 rounded-full bg-primary" />
                )}
              </div>

              <p
                className={cn(
                  'text-sm',
                  !insight.isRead ? 'text-foreground/80' : 'text-foreground/60',
                )}
              >
                {insight.description}
              </p>

              {insight.actionableSteps.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-foreground/60 list-disc list-inside">
                  {insight.actionableSteps.slice(0, 3).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3 mt-2 text-xs text-foreground/40">
                <ClientDateTime
                  value={insight.createdAt}
                  format={(date) =>
                    formatDistanceToNow(date, { addSuffix: true })
                  }
                />
                <span className="tabular-nums">
                  {translate('confidence', {
                    value: Math.round(insight.confidence),
                  })}
                </span>
              </div>
            </Button>

            {onDismiss && (
              <Button
                type="button"
                onClick={() => onDismiss(insight.id)}
                variant={ButtonVariant.UNSTYLED}
                className="p-1 rounded-full hover:bg-muted/50 transition-colors"
                ariaLabel={translate('dismissAriaLabel')}
              >
                <X className="size-4 text-foreground/40" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
});

export default InsightListCard;
