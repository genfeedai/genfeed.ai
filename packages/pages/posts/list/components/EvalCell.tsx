'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import type { PostEvaluationProps } from '@props/posts/post-evaluation.props';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import { Button } from '@ui/primitives/button';
import { DropdownMenuItem } from '@ui/primitives/dropdown-menu';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
    return <EvaluationBadge score={score} size={ComponentSize.XS} />;
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
