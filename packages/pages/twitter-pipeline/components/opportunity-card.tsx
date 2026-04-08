'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  ITwitterOpportunity,
  ITwitterPublishResult,
} from '@genfeedai/interfaces';
import Button from '@ui/buttons/base/Button';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useState } from 'react';
import {
  HiArrowPath,
  HiArrowTopRightOnSquare,
  HiChatBubbleLeft,
  HiPencilSquare,
} from 'react-icons/hi2';

const TYPE_LABELS: Record<ITwitterOpportunity['type'], string> = {
  original: 'Original',
  quote: 'Quote',
  reply: 'Reply',
};

const TYPE_COLORS: Record<ITwitterOpportunity['type'], string> = {
  original: 'bg-emerald-500/10 text-emerald-400',
  quote: 'bg-amber-500/10 text-amber-400',
  reply: 'bg-blue-500/10 text-blue-400',
};

interface OpportunityCardProps {
  opportunity: ITwitterOpportunity;
  onPublish: (
    text: string,
    type: ITwitterOpportunity['type'],
    targetTweetId?: string,
  ) => Promise<ITwitterPublishResult | undefined>;
  isPublishing: boolean;
}

export default function OpportunityCard({
  opportunity,
  onPublish,
  isPublishing,
}: OpportunityCardProps) {
  const [text, setText] = useState(opportunity.suggestedText);
  const [publishResult, setPublishResult] =
    useState<ITwitterPublishResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charCount = text.length;
  const isOverLimit = charCount > 280;

  const handlePublish = useCallback(async () => {
    if (isOverLimit || isSubmitting || isPublishing) {
      return;
    }

    setIsSubmitting(true);
    const result = await onPublish(
      text,
      opportunity.type,
      opportunity.targetTweetId,
    );
    if (result?.success) {
      setPublishResult(result);
    }
    setIsSubmitting(false);
  }, [
    text,
    opportunity.type,
    opportunity.targetTweetId,
    onPublish,
    isOverLimit,
    isSubmitting,
    isPublishing,
  ]);

  if (publishResult?.success) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-emerald-400">
            Published successfully
          </span>
        </div>
        {publishResult.tweetUrl && (
          <PrimitiveButton asChild variant={ButtonVariant.LINK}>
            <a
              href={publishResult.tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HiArrowTopRightOnSquare className="w-4 h-4" />
              View tweet
            </a>
          </PrimitiveButton>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[opportunity.type]}`}
        >
          {TYPE_LABELS[opportunity.type]}
        </span>
        {opportunity.type === 'reply' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <HiChatBubbleLeft className="w-3 h-3" />
            Reply
          </span>
        )}
        {opportunity.type === 'quote' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <HiArrowPath className="w-3 h-3" />
            Quote
          </span>
        )}
      </div>

      {opportunity.targetAuthor && opportunity.targetTweet && (
        <div className="mb-3 rounded border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-medium">@{opportunity.targetAuthor}</span>
          <p className="mt-1 line-clamp-2">{opportunity.targetTweet}</p>
        </div>
      )}

      <div className="relative mb-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <HiPencilSquare className="w-3 h-3" />
            Edit before publishing
          </span>
          <span
            className={`text-xs font-mono ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {charCount}/280
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 italic">
        {opportunity.reason}
      </p>

      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handlePublish}
        isDisabled={isOverLimit || isSubmitting || isPublishing}
        className="w-full"
      >
        {isSubmitting ? 'Publishing...' : 'Publish'}
      </Button>
    </div>
  );
}
