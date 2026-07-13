'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { AuthorizedResearchFinding } from '@pages/research/work-surface/research-work-surface.types';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';

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
    <div className="rounded-xl border border-white/[0.08] bg-background/80 p-4">
      <div className="space-y-2">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
          <Badge variant="ghost">{Math.round(badgeValue)}</Badge>
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
    </div>
  );
}
