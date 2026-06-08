'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import { Button } from '@ui/primitives/button';
import { HiArrowUp } from 'react-icons/hi2';

export type EvalCellProps = {
  post: IPost;
  onEvaluated: (postId: string, score: number) => void;
};

export default function EvalCell({ post, onEvaluated }: EvalCellProps) {
  const { evaluation, isEvaluating, evaluate } = useEvaluation({
    autoFetch: false, // Don't auto-fetch - we already have evalScore from API
    contentId: post.id,
    contentType: 'post',
  });

  // If we have a score from the API or from a fresh evaluation, show badge
  const score = evaluation?.overallScore ?? post.evalScore;

  if (score != null) {
    return <EvaluationBadge score={score} size={ComponentSize.XS} />;
  }

  // No score - show evaluate button
  const handleEvaluate = async () => {
    try {
      const result = await evaluate();
      if (result?.overallScore != null) {
        onEvaluated(post.id, result.overallScore);
      }
    } catch {
      // Error already handled by useEvaluation hook
    }
  };

  return (
    <Button
      variant={ButtonVariant.GENERATE}
      icon={<HiArrowUp />}
      tooltip="Evaluate"
      isLoading={isEvaluating}
      onClick={handleEvaluate}
      size={ButtonSize.XS}
    />
  );
}
