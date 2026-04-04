'use client';

import UsePatternButton from '@app-components/performance-lab/UsePatternButton';
import type { ICreativePattern, PatternType } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  PatternCardProps,
  PatternTypeVariantMap,
  ScoreBarProps,
} from '@props/analytics/performance-lab.props';
import Badge from '@ui/display/badge/Badge';

const PATTERN_TYPE_VARIANT: PatternTypeVariantMap = {
  caption_formula: 'accent',
  content_structure: 'amber',
  cta_formula: 'success',
  hook_formula: 'blue',
  visual_style: 'multimodal',
};

const PATTERN_TYPE_LABEL: Record<PatternType, string> = {
  caption_formula: 'Caption Formula',
  content_structure: 'Content Structure',
  cta_formula: 'CTA Formula',
  hook_formula: 'Hook Formula',
  visual_style: 'Visual Style',
};

const SOURCE_LABEL: Record<ICreativePattern['source'], string> = {
  ad: 'Ad',
  both: 'Ad + Organic',
  organic: 'Organic',
};

function ScoreBar({ score }: ScoreBarProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const colorClass =
    clampedScore >= 75
      ? 'bg-emerald-500'
      : clampedScore >= 50
        ? 'bg-sky-500'
        : clampedScore >= 25
          ? 'bg-amber-500'
          : 'bg-rose-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-foreground/50 uppercase tracking-wider">
          Avg Score
        </span>
        <span className="text-xs font-mono font-medium text-foreground/80">
          {clampedScore}
        </span>
      </div>
      <div className="h-1 w-full bg-white/[0.06]">
        <div
          className={cn('h-full transition-all duration-300', colorClass)}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
    </div>
  );
}

export default function PatternCard({ pattern }: PatternCardProps) {
  const typeVariant = PATTERN_TYPE_VARIANT[pattern.patternType];
  const typeLabel = PATTERN_TYPE_LABEL[pattern.patternType];
  const sourceLabel = SOURCE_LABEL[pattern.source];
  const previewExamples = pattern.examples.slice(0, 3);

  return (
    <div className="border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.03] transition-all duration-200 flex flex-col gap-4 p-4">
      {/* Header row: type badge + source badge + sample size */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={typeVariant}>{typeLabel}</Badge>
          <Badge variant="ghost">{sourceLabel}</Badge>
        </div>
        <span className="text-[10px] text-foreground/40 font-mono">
          n={pattern.sampleSize}
        </span>
      </div>

      {/* Label */}
      <div>
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          {pattern.label}
        </h3>
        {pattern.description && (
          <p className="mt-1 text-xs text-foreground/50 leading-relaxed">
            {pattern.description}
          </p>
        )}
      </div>

      {/* Formula block */}
      <div className="bg-white/[0.04] border border-white/[0.06] px-3 py-2">
        <p className="text-xs font-mono text-foreground/70 leading-relaxed break-words">
          {pattern.formula}
        </p>
      </div>

      {/* Score bar */}
      <ScoreBar score={pattern.avgPerformanceScore} />

      {/* Example texts */}
      {previewExamples.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-foreground/40 uppercase tracking-wider">
            Examples
          </span>
          <ul className="space-y-1">
            {previewExamples.map((example, index) => (
              <li
                key={`${example.platform}-${index}`}
                className="text-xs text-foreground/60 truncate"
                title={example.text}
              >
                {example.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action */}
      <div className="pt-1 border-t border-white/[0.06]">
        <UsePatternButton pattern={pattern} />
      </div>
    </div>
  );
}
