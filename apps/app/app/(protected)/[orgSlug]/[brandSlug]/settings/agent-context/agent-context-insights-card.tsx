'use client';

import type { AgentContextInsightsCardProps } from '@props/settings/agent-context.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Skeleton } from '@ui/primitives/skeleton';
import { useTranslations } from 'next-intl';

/** Every distilled BrandMemory insight, newest first. */
export default function AgentContextInsightsCard({
  insights,
  isError,
}: AgentContextInsightsCardProps) {
  const translate = useTranslations('pages.brandAgentContext');

  let body = null;
  if (insights === null) {
    body = <Skeleton className="h-16 w-full" />;
  } else if (isError) {
    body = (
      <p className="text-sm text-muted-foreground">
        {translate('insights.loadError')}
      </p>
    );
  } else if (insights.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        {translate('insights.empty')}
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col">
        {insights.map((insight) => (
          <div
            className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0"
            key={insight.id}
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{insight.category}</Badge>
              <span className="text-xs text-muted-foreground">
                {translate('insights.confidence', {
                  confidence: Math.round(insight.confidence * 100),
                })}
              </span>
            </span>
            <p className="text-sm break-words">{insight.insight}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card
      description={translate('insights.description')}
      label={translate('insights.title')}
    >
      {body}
    </Card>
  );
}
