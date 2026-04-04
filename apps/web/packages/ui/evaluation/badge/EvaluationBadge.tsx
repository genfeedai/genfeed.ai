'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { EvaluationBadgeProps } from '@props/components/evaluation-card.props';

const getScoreColor = (score: number) => {
  if (score >= 90) {
    return 'bg-success text-success-content';
  }
  if (score >= 70) {
    return 'bg-info text-info-content';
  }
  if (score >= 50) {
    return 'bg-warning text-warning-content';
  }
  return 'bg-error text-error-content';
};

const getScoreLabel = (score: number) => {
  if (score >= 90) {
    return 'Excellent';
  }
  if (score >= 70) {
    return 'Good';
  }
  if (score >= 50) {
    return 'Average';
  }
  return 'Needs Work';
};

const sizeClasses = {
  md: 'text-sm px-2 py-1 min-w-badge-md',
  sm: 'text-xs px-1.5 py-0.5 min-w-badge-sm',
  xs: 'text-[10px] px-1 py-0.5 min-w-badge-xs',
};

export default function EvaluationBadge({
  score,
  size = ComponentSize.SM,
  showLabel = false,
}: EvaluationBadgeProps) {
  const colorClass = getScoreColor(score);
  const sizeClass = sizeClasses[size];

  return (
    <div
      className={`inline-flex items-center gap-2 font-bold ${colorClass} ${sizeClass}`}
      title={`Quality Score: ${score}/100 - ${getScoreLabel(score)}`}
    >
      <span>{score}</span>
      {showLabel && (
        <span className="font-normal opacity-80">{getScoreLabel(score)}</span>
      )}
    </div>
  );
}
