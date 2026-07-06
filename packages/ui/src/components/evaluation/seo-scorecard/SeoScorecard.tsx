'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SeoCheck,
  SeoDimension,
  SeoScorecardSnapshot,
} from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Separator } from '@ui/primitives/separator';
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Gauge,
  RefreshCw,
} from 'lucide-react';

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

const DIMENSION_LABELS: Record<SeoDimension, string> = {
  contentStructure: 'Structure',
  keywordPlacement: 'Keyword',
  links: 'Links',
  media: 'Media',
  metaOptimization: 'Metadata',
  readability: 'Readability',
  technicalSignals: 'Technical',
};

const RATING_LABELS: Record<string, string> = {
  critical: 'Critical',
  excellent: 'Excellent',
  good: 'Good',
  needs_work: 'Needs work',
  poor: 'Poor',
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
      return <CheckCircle2 className="size-3.5" />;
    case 'partial':
      return <CircleDot className="size-3.5" />;
    case 'fix':
      return <AlertCircle className="size-3.5" />;
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

export default function SeoScorecard({
  score,
  scorecard,
  contentTypeLabel = 'content',
  isScoring = false,
  isDisabled = false,
  hasUnsavedChanges = false,
  onScore,
  className,
}: SeoScorecardProps) {
  const resolvedScore =
    typeof score === 'number'
      ? formatScore(score)
      : typeof scorecard?.score === 'number'
        ? formatScore(scorecard.score)
        : null;
  const hasScore = resolvedScore !== null;
  const actionLabel = hasScore ? 'Re-score' : 'Score';
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
      ariaLabel={`${actionLabel} SEO`}
      icon={<RefreshCw className="size-4" />}
      isDisabled={scoreDisabled}
      isLoading={isScoring}
      label={isScoring ? 'Scoring' : actionLabel}
      onClick={() => {
        void onScore();
      }}
      size={ButtonSize.SM}
      tooltip={
        hasUnsavedChanges
          ? 'Save changes before scoring SEO'
          : `${actionLabel} SEO`
      }
      variant={ButtonVariant.GENERATE}
    />
  ) : undefined;

  if (!hasScore || !scorecard) {
    return (
      <Card
        label="SEO Scorecard"
        headerAction={headerAction}
        className={className}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Gauge className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">No SEO score yet</p>
            <p className="text-xs leading-relaxed text-foreground/60">
              Score this {contentTypeLabel.toLowerCase()} to check keywords,
              metadata, links, media, structure, and readability.
            </p>
            {hasUnsavedChanges ? (
              <p className="text-xs text-warning">
                Save your changes before scoring.
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="SEO Scorecard"
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
              {RATING_LABELS[scorecard.rating] ?? scorecard.rating}
            </Badge>
            {scorecard.meta?.targetKeyword ? (
              <Badge variant="outline">{scorecard.meta.targetKeyword}</Badge>
            ) : null}
          </div>
        </div>

        <div className="text-right text-xs text-foreground/60">
          <p>{scorecard.meta?.wordCount ?? 0} words</p>
          <p>Flesch {Math.round(scorecard.meta?.fleschReadingEase ?? 0)}</p>
          {scorecard.meta?.keywordDensity !== null &&
          scorecard.meta?.keywordDensity !== undefined ? (
            <p>{scorecard.meta.keywordDensity.toFixed(1)}% keyword</p>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        {SEO_DIMENSIONS.map((dimension) => {
          const value = scorecard.breakdown?.[dimension] ?? 0;
          const max = SEO_DIMENSION_MAX[dimension];
          return (
            <div key={dimension} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground/70">
                  {DIMENSION_LABELS[dimension]}
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

      {deterministicChecks.length > 0 ? (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground/60 uppercase">
              Checks
            </h4>
            <div className="flex flex-wrap gap-2">
              {deterministicChecks.map((check) => {
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
        </>
      ) : null}

      {scorecard.suggestions.length > 0 ? (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground/60 uppercase">
              Suggestions
            </h4>
            <ul className="space-y-1.5">
              {scorecard.suggestions.slice(0, 4).map((suggestion) => (
                <li
                  key={suggestion}
                  className="text-xs leading-relaxed text-foreground/70"
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </Card>
  );
}
