'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
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
    <Card bodyClassName="p-4">
      <div className="space-y-2">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          <Badge variant="secondary">{Math.round(badgeValue)}</Badge>
          {detail ? <span>{detail}</span> : null}
        </div>
        {finding && onSelect ? (
          <Button
            aria-pressed={isSelected}
            label={isSelected ? 'Selected for context' : 'Use as context'}
            onClick={() => onSelect(finding)}
            size={ButtonSize.SM}
            variant={isSelected ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
          />
        ) : null}
      </div>
    </Card>
  );
}
