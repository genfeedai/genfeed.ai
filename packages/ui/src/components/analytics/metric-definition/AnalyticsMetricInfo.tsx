'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';
import { getAnalyticsMetricDefinitionKey } from '@genfeedai/helpers/analytics/analytics-metric-definition.util';
import type {
  AnalyticsMetricInfoProps,
  AnalyticsMetricLabelProps,
} from '@genfeedai/props/analytics/analytics-metric-definition.props';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

function TranslatedMetricInfo({ metric }: AnalyticsMetricInfoProps) {
  const translate = useTranslations('pages.analytics');
  const definitionKey = getAnalyticsMetricDefinitionKey(metric);
  if (!definitionKey) return null;
  const canonicalMetric = metric as AnalyticsQueryMetric;
  return (
    <SimpleTooltip
      label={translate(definitionKey)}
      contentClassName="max-w-xs whitespace-normal text-left leading-relaxed normal-case tracking-normal"
    >
      <Button
        ariaLabel={translate('metricDefinitionLabel', {
          metric: translate(`metricLabels.${canonicalMetric}`),
        })}
        className="relative z-20 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        textTransform="none"
        type="button"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <Info aria-hidden="true" className="size-3.5" />
      </Button>
    </SimpleTooltip>
  );
}

export default function AnalyticsMetricInfo({
  metric,
}: AnalyticsMetricInfoProps) {
  return getAnalyticsMetricDefinitionKey(metric) ? (
    <TranslatedMetricInfo metric={metric} />
  ) : null;
}

export function AnalyticsMetricLabel({
  metric,
  children,
}: AnalyticsMetricLabelProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <AnalyticsMetricInfo metric={metric} />
    </span>
  );
}
