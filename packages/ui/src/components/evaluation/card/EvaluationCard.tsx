'use client';

import {
  ButtonSize,
  ButtonVariant,
  EvaluationSeverity,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { EvaluationCardProps } from '@genfeedai/props/components/evaluation-card.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import { HiArrowUp, HiChevronDown } from 'react-icons/hi2';

// Score thresholds with corresponding color classes
const SCORE_THRESHOLDS = [
  {
    bar: 'bg-success',
    bg: 'bg-success/20 text-success',
    min: 90,
    text: 'text-success',
  },
  { bar: 'bg-info', bg: 'bg-info/20 text-info', min: 70, text: 'text-info' },
  {
    bar: 'bg-warning',
    bg: 'bg-warning/20 text-warning',
    min: 50,
    text: 'text-warning',
  },
  { bar: 'bg-error', bg: 'bg-error/20 text-error', min: 0, text: 'text-error' },
] as const;

function getScoreColors(score: number): {
  text: string;
  bg: string;
  bar: string;
} {
  const threshold =
    SCORE_THRESHOLDS.find((t) => score >= t.min) ?? SCORE_THRESHOLDS[3];
  return { bar: threshold.bar, bg: threshold.bg, text: threshold.text };
}

const FACTOR_LABELS: Record<string, string> = {
  audioQuality: 'Audio Quality',
  audioSync: 'Audio Sync',
  ctaEffectiveness: 'CTA Effectiveness',
  emotionalAppeal: 'Emotional Appeal',
  formatting: 'Formatting',
  frameRate: 'Frame Rate',
  hookQuality: 'Hook Quality',
  lengthAppropriateness: 'Length',
  messageAlignment: 'Message Alignment',
  platformFit: 'Platform Fit',
  readability: 'Readability',
  resolution: 'Resolution',
  seoScore: 'SEO Score',
  shareability: 'Shareability',
  styleAlignment: 'Style Alignment',
  toneAlignment: 'Tone Alignment',
  viralityPotential: 'Virality Potential',
  visualConsistency: 'Visual Consistency',
  voiceConsistency: 'Voice Consistency',
};

function formatFactorLabel(key: string): string {
  return FACTOR_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Renders a score category section with header and score bars.
 */
function ScoreSection({
  title,
  scores,
  overallScore,
}: {
  title: string;
  scores: Record<string, unknown> | undefined;
  overallScore?: number;
}): React.ReactElement | null {
  if (!scores) {
    return null;
  }

  const entries = Object.entries(scores).filter(([key]) => key !== 'overall');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
          {title}
        </h4>
        {overallScore !== undefined && (
          <span
            className={cn(
              'text-xs font-medium',
              getScoreColors(overallScore).text,
            )}
          >
            {overallScore}
          </span>
        )}
      </div>
      {entries.map(([key, value]) =>
        value !== undefined && value !== null ? (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs w-28 text-foreground/60">
              {formatFactorLabel(key)}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full', getScoreColors(value as number).bar)}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="text-xs w-8 text-right font-medium">
              {String(value)}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  [IngredientCategory.IMAGE]: 'Image',
  [IngredientCategory.VIDEO]: 'Video',
  article: 'Article',
  post: 'Post',
};

export default function EvaluationCard({
  contentType,
  evaluation,
  onEvaluate,
  isEvaluating = false,
  isPublished = false,
}: EvaluationCardProps) {
  // When published, start collapsed by default
  const [isCardCollapsed, setIsCardCollapsed] = useState(
    () => isPublished && evaluation?.status === Status.COMPLETED,
  );
  const [isScoresCollapsed, setIsScoresCollapsed] = useState(false);
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(true);

  const contentTypeLabel = CONTENT_TYPE_LABELS[contentType] ?? 'Content';

  // Get the 3 lowest scores for "Focus Areas"
  const getLowestScores = () => {
    if (!evaluation?.scores) {
      return [];
    }

    const allScores: [string, number][] = [
      ...Object.entries(evaluation.scores.technical ?? {}),
      ...Object.entries(evaluation.scores.brand ?? {}),
      ...Object.entries(evaluation.scores.engagement ?? {}),
    ].filter(([key, val]) => key !== 'overall' && typeof val === 'number') as [
      string,
      number,
    ][];

    return allScores.sort((a, b) => a[1] - b[1]).slice(0, 3);
  };

  const lowestScores = getLowestScores();

  // Determine header action based on state
  const getHeaderAction = () => {
    if (!evaluation || evaluation.status === Status.FAILED) {
      return undefined;
    }
    if (evaluation.status === Status.PROCESSING || isEvaluating) {
      return undefined;
    }

    const { overallScore } = evaluation;

    // When published, show collapsed summary with score
    if (isPublished && evaluation.status === Status.COMPLETED) {
      return (
        <Button
          type="button"
          onClick={() => setIsCardCollapsed(!isCardCollapsed)}
          variant={ButtonVariant.UNSTYLED}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div
            className={cn(
              'px-2 py-0.5 font-bold text-sm',
              getScoreColors(overallScore ?? 0).bg,
            )}
          >
            {overallScore ?? 0}/100
          </div>
          <HiChevronDown
            className={cn(
              'w-4 h-4 text-foreground/50 transition-transform',
              isCardCollapsed && '-rotate-90',
            )}
          />
        </Button>
      );
    }

    // When not published, show score and run button
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'px-2 py-0.5 font-bold text-sm',
            getScoreColors(overallScore ?? 0).bg,
          )}
        >
          {overallScore ?? 0}/100
        </div>

        <Button
          variant={ButtonVariant.GENERATE}
          icon={<HiArrowUp />}
          label="Run"
          onClick={onEvaluate}
          size={ButtonSize.SM}
          isLoading={isEvaluating}
          isDisabled={isEvaluating}
        />
      </div>
    );
  };

  // Render content based on state
  const renderContent = () => {
    // No evaluation yet
    if (!evaluation) {
      return (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-foreground/70">
            Get AI-powered quality analysis for this{' '}
            {contentTypeLabel.toLowerCase()}
          </p>

          {!isPublished && (
            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              label={isEvaluating ? 'Running...' : 'Run'}
              onClick={onEvaluate}
              isLoading={isEvaluating}
              isDisabled={isEvaluating}
            />
          )}
        </div>
      );
    }

    // Evaluation in progress
    if (evaluation.status === Status.PROCESSING || isEvaluating) {
      return (
        <div className="flex items-center gap-3">
          <span className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          <div>
            <p className="text-sm font-medium">
              {evaluation?.scores
                ? 'Re-evaluating content...'
                : 'Analyzing content...'}
            </p>

            <p className="text-xs text-foreground/60">
              This usually takes a few seconds
            </p>
          </div>
        </div>
      );
    }

    // Evaluation failed
    if (evaluation.status === Status.FAILED) {
      return (
        <>
          <div className="flex items-center gap-3 text-error mb-4">
            <span className="text-sm">
              Evaluation failed. Please try again.
            </span>
          </div>
          {!isPublished && (
            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              label={isEvaluating ? 'Running...' : 'Run'}
              onClick={onEvaluate}
              isLoading={isEvaluating}
              isDisabled={isEvaluating}
            />
          )}
        </>
      );
    }

    // Evaluation complete - show full results
    const { scores, analysis, flags } = evaluation;

    // When published and collapsed, show summary
    if (isPublished && isCardCollapsed) {
      return (
        <div className="space-y-2">
          {lowestScores.length > 0 && lowestScores[0][1] < 50 && (
            <div className="text-xs text-foreground/60">
              Focus:{' '}
              {lowestScores
                .slice(0, 2)
                .map(([key, val]) => `${formatFactorLabel(key)} (${val})`)
                .join(', ')}
            </div>
          )}
          {flags?.isFlagged && (
            <div className="text-xs text-warning">
              {flags.severity === EvaluationSeverity.CRITICAL ? '⚠️' : '⚠'}{' '}
              {flags.reasons[0]}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Focus Areas - Show 3 lowest scores */}
        {lowestScores.length > 0 && lowestScores[0][1] < 50 && (
          <div className="p-2 bg-warning/10 border border-warning/20 text-sm">
            <span className="font-medium text-warning">Focus:</span>{' '}
            <span className="text-foreground/70">
              {lowestScores
                .map(([key, val]) => `${formatFactorLabel(key)} (${val})`)
                .join(', ')}
            </span>
          </div>
        )}

        {/* Flagged Warning */}
        {flags?.isFlagged && (
          <div
            className={cn(
              'p-2 text-sm',
              flags.severity === EvaluationSeverity.CRITICAL
                ? 'bg-error/10 border border-error/30 text-error'
                : flags.severity === EvaluationSeverity.WARNING
                  ? 'bg-warning/10 border border-warning/30 text-warning'
                  : 'bg-info/10 border border-info/30 text-info',
            )}
          >
            <span className="font-medium capitalize">{flags.severity}:</span>{' '}
            {flags.reasons.join(', ')}
          </div>
        )}

        {/* Category Scores */}
        <div className="space-y-3">
          <Button
            type="button"
            onClick={() => setIsScoresCollapsed(!isScoresCollapsed)}
            variant={ButtonVariant.UNSTYLED}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
              Category Scores
            </h4>
            <HiChevronDown
              className={cn(
                'w-4 h-4 text-foreground/50 transition-transform',
                isScoresCollapsed && '-rotate-90',
              )}
            />
          </Button>

          {!isScoresCollapsed && (
            <div className="space-y-3">
              <ScoreSection
                title="Technical"
                scores={
                  scores?.technical as Record<string, unknown> | undefined
                }
                overallScore={scores?.technical?.overall}
              />
              <ScoreSection
                title="Brand Alignment"
                scores={scores?.brand as Record<string, unknown> | undefined}
                overallScore={scores?.brand?.overall}
              />
              <ScoreSection
                title="Engagement Potential"
                scores={
                  scores?.engagement as Record<string, unknown> | undefined
                }
                overallScore={scores?.engagement?.overall}
              />
            </div>
          )}
        </div>

        {/* Strengths & Weaknesses */}
        <div className="space-y-3">
          <Button
            type="button"
            onClick={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)}
            variant={ButtonVariant.UNSTYLED}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
              Strengths & Weaknesses
            </h4>
            <HiChevronDown
              className={cn(
                'w-4 h-4 text-foreground/50 transition-transform',
                isAnalysisCollapsed && '-rotate-90',
              )}
            />
          </Button>

          {!isAnalysisCollapsed && (
            <div className="space-y-3">
              {(analysis?.strengths?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-success mb-2">
                    Strengths
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis?.strengths?.slice(0, 3).map((s, i) => (
                      <li
                        key={i}
                        className="text-xs text-foreground/70 pl-3 border-l-2 border-success/30"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(analysis?.weaknesses?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-error mb-2">
                    Weaknesses
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis?.weaknesses?.slice(0, 3).map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-foreground/70 pl-3 border-l-2 border-error/30"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Suggestions */}
        {(analysis?.suggestions?.length ?? 0) > 0 && (
          <div>
            <Button
              type="button"
              onClick={() => setIsSuggestionsCollapsed(!isSuggestionsCollapsed)}
              variant={ButtonVariant.UNSTYLED}
              className="flex items-center justify-between w-full text-left"
            >
              <h4 className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                AI Suggestions
              </h4>
              <HiChevronDown
                className={cn(
                  'w-4 h-4 text-foreground/50 transition-transform',
                  isSuggestionsCollapsed && '-rotate-90',
                )}
              />
            </Button>
            {!isSuggestionsCollapsed && (
              <div className="space-y-2">
                {analysis?.suggestions?.map((suggestion, i) => (
                  <div
                    key={i}
                    className="text-xs p-2 bg-primary/5 border border-primary/20"
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last evaluated */}
        {evaluation.updatedAt && (
          <div className="text-xs text-foreground/50 text-right">
            Evaluated {new Date(evaluation.updatedAt).toLocaleString()}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      label="Quality Evaluation"
      headerAction={getHeaderAction()}
      className="border border-white/[0.08] bg-card"
      bodyClassName={
        !evaluation || evaluation.status !== Status.COMPLETED
          ? undefined
          : 'space-y-4'
      }
    >
      {renderContent()}
    </Card>
  );
}
