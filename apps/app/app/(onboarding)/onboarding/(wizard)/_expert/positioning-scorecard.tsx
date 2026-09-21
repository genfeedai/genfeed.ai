'use client';

import { getExpertPositioningRatingLabel } from '@genfeedai/contracts/constants';
import type { PositioningScorecardProps } from '@props/onboarding/expert-path.props';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

export default function PositioningScorecard({
  score,
}: PositioningScorecardProps) {
  const translate = useTranslations('pages.onboarding.expert.positioning');
  const weakest = score.dimensions.find(
    (dimension) => dimension.key === score.weakestDimension,
  );

  return (
    <div className="max-w-2xl space-y-5 border border-border bg-background-tertiary p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {translate('scoreTitle')}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-semibold tabular-nums text-foreground">
            {translate('scoreOutOf', { score: score.totalScore })}
          </span>
          <Badge variant="outline">
            {getExpertPositioningRatingLabel(score.rating)}
          </Badge>
        </div>
      </div>

      <ul className="space-y-2">
        {score.dimensions.map((dimension) => (
          <li
            key={dimension.key}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span
              className={
                dimension.key === score.weakestDimension
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              }
            >
              {dimension.label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {translate('dimensionScore', { score: dimension.score })}
            </span>
          </li>
        ))}
      </ul>

      {weakest ? (
        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">
            {translate('weakestTitle', { label: weakest.label })}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate('weakestHint')}
          </p>
          <p className="text-sm text-foreground">{weakest.followUpQuestion}</p>
        </div>
      ) : null}
    </div>
  );
}
