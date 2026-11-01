'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import type { BadgeVariant } from '@ui/primitives/badge.variants';
import { Button } from '@ui/primitives/button';
import { DropdownMenuItem } from '@ui/primitives/dropdown-menu';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PostEvaluationProps } from '@/features/posts/props/post-evaluation.props';
import { useEvaluation } from '@/hooks/ui/evaluation/use-evaluation/use-evaluation';

function getScoreTone(score: number): { label: string; variant: BadgeVariant } {
  if (score >= 90) {
    return { label: 'Excellent', variant: 'success' };
  }
  if (score >= 70) {
    return { label: 'Good', variant: 'info' };
  }
  if (score >= 50) {
    return { label: 'Average', variant: 'warning' };
  }
  return { label: 'Needs Work', variant: 'destructive' };
}

export default function EvalCell({
  post,
  onEvaluated,
  presentation = 'table',
}: PostEvaluationProps) {
  const translate = useTranslations('pages.posts.list.collection');
  const isGrid = presentation === 'grid';
  const { evaluation, isEvaluating, evaluate } = useEvaluation({
    autoFetch: false,
    contentId: post.id,
    contentType: 'post',
  });

  const score = evaluation?.data.overallScore ?? post.evalScore;

  if (score != null && presentation !== 'menu') {
    const { label, variant } = getScoreTone(score);
    return (
      <Badge
        casing="normal"
        isSolid
        title={`Quality Score: ${score}/100 - ${label}`}
        variant={variant}
      >
        {score}
      </Badge>
    );
  }

  const handleEvaluate = async () => {
    try {
      const result = await evaluate();
      if (result?.data.overallScore != null) {
        onEvaluated(post.id, result.data.overallScore);
      }
    } catch {
      // Error already handled by useEvaluation hook
    }
  };

  if (presentation === 'menu') {
    return (
      <DropdownMenuItem
        disabled={isEvaluating || score != null}
        onSelect={() => void handleEvaluate()}
      >
        {score != null
          ? translate('evaluationScore', { score })
          : translate('evaluate')}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      variant={isGrid ? ButtonVariant.GHOST : ButtonVariant.DEFAULT}
      ariaLabel={isGrid ? undefined : 'Evaluate'}
      icon={<ArrowUp />}
      label={isGrid ? 'Evaluate' : undefined}
      tooltip="Evaluate"
      isLoading={isEvaluating}
      onClick={(event) => {
        if (isGrid) event.stopPropagation();
        void handleEvaluate();
      }}
      size={ButtonSize.XS}
      className={
        isGrid
          ? 'rounded-lg border border-border bg-muted px-2.5 text-muted-foreground hover:bg-hover hover:text-foreground'
          : undefined
      }
    />
  );
}
