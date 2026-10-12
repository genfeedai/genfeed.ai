'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  SeoCheck,
  SeoDimension,
  SeoScorecardSnapshot,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Separator } from '@ui/primitives/separator';
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Gauge,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const DETERMINISTIC_CHECK_IDS = [
  'title_length',
  'meta_length',
  'slug_format',
  'heading_hierarchy',
  'image_alt_text',
  'internal_links',
] as const;

const SEO_DIMENSIONS: SeoDimension[] = [
  'keywordPlacement',
  'contentStructure',
  'readability',
  'metaOptimization',
  'links',
  'media',
  'technicalSignals',
];

const SEO_DIMENSION_MAX: Record<SeoDimension, number> = {
  contentStructure: 20,
  keywordPlacement: 20,
  links: 10,
  media: 10,
  metaOptimization: 15,
  readability: 15,
  technicalSignals: 10,
};

/** Rating values the scorer returns, mapped to `ui.seoScorecard.ratings` keys. */
const RATING_KEYS: Record<string, string> = {
  critical: 'critical',
  excellent: 'excellent',
  good: 'good',
  needs_work: 'needsWork',
  poor: 'poor',
};

type CheckState = 'pass' | 'partial' | 'fix' | 'unavailable';

export interface SeoScorecardProps {
  score?: number | null;
  scorecard?: SeoScorecardSnapshot | null;
  contentTypeLabel?: string;
  isScoring?: boolean;
  isDisabled?: boolean;
  hasUnsavedChanges?: boolean;
  onScore?: () => void | Promise<void>;
  className?: string;
  /** `embedded` renders one compact row with expandable details, no Card. */
  variant?: 'card' | 'embedded';
}

function getScoreTone(score: number): string {
  if (score >= 85) {
    return 'text-success';
  }
  if (score >= 70) {
    return 'text-info';
  }
  if (score >= 50) {
    return 'text-warning';
  }
  return 'text-error';
}

function getCheckState(check: SeoCheck): CheckState {
  if (!check.available) {
    return 'unavailable';
  }

  const ratio = check.max > 0 ? check.points / check.max : 0;
  if (ratio >= 0.9) {
    return 'pass';
  }
  if (ratio >= 0.5) {
    return 'partial';
  }
  return 'fix';
}

function getCheckIcon(state: CheckState) {
  switch (state) {
    case 'pass':
      return <CircleCheck className="size-3.5" />;
    case 'partial':
      return <CircleDot className="size-3.5" />;
    case 'fix':
      return <CircleAlert className="size-3.5" />;
    case 'unavailable':
      return <CircleDot className="size-3.5" />;
  }
}

function getCheckVariant(state: CheckState) {
  switch (state) {
    case 'pass':
      return 'success';
    case 'partial':
      return 'warning';
    case 'fix':
      return 'destructive';
    case 'unavailable':
      return 'outline';
  }
}

function formatPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.round((value / max) * 100);
}

function formatScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function SeoDimensionBars({ scorecard }: { scorecard: SeoScorecardSnapshot }) {
  const translate = useTranslations('ui.seoScorecard');

  return (
    <div className="space-y-2">
      {SEO_DIMENSIONS.map((dimension) => {
        const value = scorecard.breakdown?.[dimension] ?? 0;
        const max = SEO_DIMENSION_MAX[dimension];
        return (
          <div key={dimension} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-foreground/70">
                {translate(`dimensions.${dimension}`)}
              </span>
              <span className="text-foreground/50">
                {value}/{max}
              </span>
            </div>
            <Progress value={formatPercent(value, max)} />
          </div>
        );
      })}
    </div>
  );
}

function SeoChecks({ checks }: { checks: SeoCheck[] }) {
  const translate = useTranslations('ui.seoScorecard');

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-foreground/60 uppercase">
        {translate('checks')}
      </h4>
      <div className="flex flex-wrap gap-2">
        {checks.map((check) => {
          const state = getCheckState(check);
          return (
            <Badge
              key={check.id}
              variant={getCheckVariant(state)}
              title={check.note}
              className="inline-flex items-center gap-1.5"
            >
              {getCheckIcon(state)}
              {check.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

function SeoSuggestions({ suggestions }: { suggestions: string[] }) {
  const translate = useTranslations('ui.seoScorecard');

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-foreground/60 uppercase">
        {translate('suggestions')}
      </h4>
      <ul className="space-y-1.5">
        {suggestions.slice(0, 4).map((suggestion) => (
          <li
            key={suggestion}
            className="text-xs leading-relaxed text-foreground/70"
          >
            {suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SeoScorecard({
  score,
  scorecard,
  contentTypeLabel,
  isScoring = false,
  isDisabled = false,
  hasUnsavedChanges = false,
  onScore,
  className,
  variant = 'card',
}: SeoScorecardProps) {
  const translate = useTranslations('ui.seoScorecard');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const resolvedScore =
    typeof score === 'number'
      ? formatScore(score)
      : typeof scorecard?.score === 'number'
        ? formatScore(scorecard.score)
        : null;
  const hasScore = resolvedScore !== null;
  const actionLabel = hasScore ? translate('rescore') : translate('score');
  const actionSeoLabel = translate('actionSeo', { action: actionLabel });
  const resolvedContentType = (
    contentTypeLabel ?? translate('defaultContentType')
  ).toLowerCase();
  const ratingKey = scorecard ? RATING_KEYS[scorecard.rating] : undefined;
  const ratingLabel =
    scorecard && ratingKey
      ? translate(`ratings.${ratingKey}`)
      : (scorecard?.rating ?? '');
  const scoreDisabled =
    isDisabled || isScoring || hasUnsavedChanges || !onScore;
  const deterministicChecks =
    scorecard?.checks?.filter((check) =>
      DETERMINISTIC_CHECK_IDS.includes(
        check.id as (typeof DETERMINISTIC_CHECK_IDS)[number],
      ),
    ) ?? [];

  const headerAction = onScore ? (
    <Button
      ariaLabel={actionSeoLabel}
      icon={<RefreshCw className="size-4" />}
      isDisabled={scoreDisabled}
      isLoading={isScoring}
      label={isScoring ? translate('scoring') : actionLabel}
      onClick={() => {
        void onScore();
      }}
      size={ButtonSize.SM}
      tooltip={
        hasUnsavedChanges ? translate('saveBeforeScoringSeo') : actionSeoLabel
      }
      variant={ButtonVariant.DEFAULT}
    />
  ) : undefined;

  if (variant === 'embedded') {
    return (
      <div className="flex flex-col gap-2" data-testid="seo-row">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {translate('seoScore')}
          </span>
          {hasScore ? (
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                getScoreTone(resolvedScore),
              )}
            >
              {resolvedScore}
              <span className="text-xs font-medium text-foreground/40">
                /100
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {translate('notScored')}
            </span>
          )}
          {onScore ? (
            <Button
              ariaLabel={actionSeoLabel}
              icon={<RefreshCw className="size-4" />}
              isDisabled={scoreDisabled}
              isLoading={isScoring}
              label={isScoring ? translate('scoring') : actionLabel}
              onClick={() => {
                void onScore();
              }}
              size={ButtonSize.SM}
              tooltip={
                hasUnsavedChanges
                  ? translate('saveBeforeScoringSeo')
                  : actionSeoLabel
              }
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
        </div>
        {hasUnsavedChanges ? (
          <p className="text-xs text-warning">
            {translate('saveBeforeScoring')}
          </p>
        ) : null}
        {hasScore && scorecard ? (
          <>
            <Button
              type="button"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              ariaLabel={translate('toggleDetails')}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform',
                  !isDetailsOpen && '-rotate-90',
                )}
              />
              {translate('details')}
            </Button>
            {isDetailsOpen ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={resolvedScore >= 70 ? 'success' : 'warning'}>
                    {ratingLabel}
                  </Badge>
                  {scorecard.meta?.targetKeyword ? (
                    <Badge variant="outline">
                      {scorecard.meta.targetKeyword}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-foreground/60">
                    {translate('words', {
                      count: scorecard.meta?.wordCount ?? 0,
                    })}
                  </span>
                </div>
                <SeoDimensionBars scorecard={scorecard} />
                {deterministicChecks.length > 0 ? (
                  <SeoChecks checks={deterministicChecks} />
                ) : null}
                {scorecard.suggestions.length > 0 ? (
                  <SeoSuggestions suggestions={scorecard.suggestions} />
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  if (!hasScore || !scorecard) {
    return (
      <Card
        label={translate('title')}
        headerAction={headerAction}
        className={className}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Gauge className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{translate('emptyTitle')}</p>
            <p className="text-xs leading-relaxed text-foreground/60">
              {translate('emptyBody', { contentType: resolvedContentType })}
            </p>
            {hasUnsavedChanges ? (
              <p className="text-xs text-warning">
                {translate('saveBeforeScoring')}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label={translate('title')}
      headerAction={headerAction}
      className={cn('bg-card', className)}
      bodyClassName="space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div
            className={cn(
              'text-4xl font-semibold',
              getScoreTone(resolvedScore),
            )}
          >
            {resolvedScore}
            <span className="text-base font-medium text-foreground/40">
              /100
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={resolvedScore >= 70 ? 'success' : 'warning'}>
              {ratingLabel}
            </Badge>
            {scorecard.meta?.targetKeyword ? (
              <Badge variant="outline">{scorecard.meta.targetKeyword}</Badge>
            ) : null}
          </div>
        </div>

        <div className="text-right text-xs text-foreground/60">
          <p>{translate('words', { count: scorecard.meta?.wordCount ?? 0 })}</p>
          <p>
            {translate('flesch', {
              score: Math.round(scorecard.meta?.fleschReadingEase ?? 0),
            })}
          </p>
          {scorecard.meta?.keywordDensity !== null &&
          scorecard.meta?.keywordDensity !== undefined ? (
            <p>
              {translate('keywordDensity', {
                percent: scorecard.meta.keywordDensity.toFixed(1),
              })}
            </p>
          ) : null}
        </div>
      </div>

      <Separator />

      <SeoDimensionBars scorecard={scorecard} />

      {deterministicChecks.length > 0 ? (
        <>
          <Separator />
          <SeoChecks checks={deterministicChecks} />
        </>
      ) : null}

      {scorecard.suggestions.length > 0 ? (
        <>
          <Separator />
          <SeoSuggestions suggestions={scorecard.suggestions} />
        </>
      ) : null}
    </Card>
  );
}
