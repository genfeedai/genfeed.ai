'use client';

import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Toggle } from '@ui/primitives/toggle';
import type { AuthorizedResearchFinding } from '@/features/research/work-surface/research-work-surface.types';

type RelatedMetricCardProps = {
  badgeValue: number;
  detail?: string | null;
  finding?: AuthorizedResearchFinding;
  isSelected?: boolean;
  onSelect?: (finding: AuthorizedResearchFinding) => void;
  title: string;
};

export default function RelatedMetricCard({
  badgeValue,
  detail,
  finding,
  isSelected = false,
  onSelect,
  title,
}: RelatedMetricCardProps) {
  return (
    <Card>
      <div className="space-y-2">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          <Badge variant="secondary">{Math.round(badgeValue)}</Badge>
          {detail ? <span>{detail}</span> : null}
        </div>
        {finding && onSelect ? (
          <Toggle
            onPressedChange={() => onSelect(finding)}
            pressed={isSelected}
            size="sm"
            variant="outline"
          >
            {isSelected ? 'Selected for context' : 'Use as context'}
          </Toggle>
        ) : null}
      </div>
    </Card>
  );
}
