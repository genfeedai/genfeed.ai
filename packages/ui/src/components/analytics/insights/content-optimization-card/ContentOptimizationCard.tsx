'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ContentOptimizationCardProps } from '@genfeedai/props/analytics/insights.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';
import {
  HiClock,
  HiDocumentText,
  HiHashtag,
  HiLightBulb,
  HiPhoto,
  HiSparkles,
} from 'react-icons/hi2';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'timing':
      return HiClock;
    case 'format':
      return HiPhoto;
    case 'topic':
      return HiDocumentText;
    case 'hashtag':
      return HiHashtag;
    case 'length':
      return HiDocumentText;
    default:
      return HiLightBulb;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'timing':
      return 'text-blue-500 bg-blue-500/10';
    case 'format':
      return 'text-purple-500 bg-purple-500/10';
    case 'topic':
      return 'text-green-500 bg-green-500/10';
    case 'hashtag':
      return 'text-pink-500 bg-pink-500/10';
    case 'length':
      return 'text-orange-500 bg-orange-500/10';
    default:
      return 'text-primary bg-primary/10';
  }
};

const ContentOptimizationCard = memo(function ContentOptimizationCard({
  suggestions,
  isLoading = false,
  onApply,
  className,
}: ContentOptimizationCardProps) {
  if (isLoading) {
    return (
      <Card
        label="Content Optimization"
        icon={HiSparkles}
        iconClassName="text-secondary"
        className={className}
      >
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse flex items-start gap-4 p-4 bg-background"
            >
              <div className="w-10 h-10 bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted w-3/4" />
                <div className="h-3 bg-muted w-full" />
                <div className="h-3 bg-muted w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card
        label="Content Optimization"
        icon={HiSparkles}
        iconClassName="text-secondary"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HiLightBulb className="w-12 h-12 text-foreground/30 mb-3" />
          <p className="text-foreground/70 font-medium">
            No suggestions available
          </p>
          <p className="text-sm text-foreground/50">
            Keep creating content to receive AI-powered optimization tips
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="Content Optimization"
      icon={HiSparkles}
      iconClassName="text-secondary"
      description="AI-powered suggestions to improve your content"
      className={className}
    >
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {suggestions.map((suggestion) => {
          const Icon = getTypeIcon(suggestion.type);
          const colorClass = getTypeColor(suggestion.type);

          return (
            <div
              key={suggestion.id}
              className="flex items-start gap-4 p-4 bg-background hover:bg-background/80 transition-colors"
            >
              <div className={cn('p-2.5', colorClass)}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground">
                    {suggestion.title}
                  </h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/70 capitalize">
                    {suggestion.type}
                  </span>
                </div>

                <p className="text-sm text-foreground/70 mb-2">
                  {suggestion.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/50">
                  <span>
                    Expected impact:{' '}
                    <span className="text-success font-medium">
                      {suggestion.expectedImpact}
                    </span>
                  </span>
                  <span>
                    Confidence:{' '}
                    <span className="font-medium">
                      {Math.round(suggestion.confidence)}%
                    </span>
                  </span>
                </div>

                <p className="text-xs text-foreground/40 mt-1 italic">
                  Based on: {suggestion.basedOn}
                </p>

                {onApply && (
                  <Button
                    type="button"
                    onClick={() => onApply(suggestion.id)}
                    variant={ButtonVariant.UNSTYLED}
                    className="mt-3 h-8 px-3 text-sm font-medium border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    Apply Suggestion
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
});

export default ContentOptimizationCard;
