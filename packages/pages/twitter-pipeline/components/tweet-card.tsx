'use client';

import { CardVariant } from '@genfeedai/enums';
import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import {
  HiArrowPath,
  HiChatBubbleLeft,
  HiCheckBadge,
  HiHeart,
} from 'react-icons/hi2';

interface TweetCardProps {
  tweet: ITwitterSearchResult;
}

export default function TweetCard({ tweet }: TweetCardProps) {
  return (
    <Card variant={CardVariant.DEFAULT} bodyClassName="gap-0 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
          {tweet.authorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-foreground truncate">
              {tweet.authorName}
            </span>
            <HiCheckBadge className="size-4 text-primary shrink-0" />
          </div>
          <span className="text-xs text-muted-foreground">
            @{tweet.authorUsername}
          </span>
        </div>
      </div>

      <p className="text-sm text-foreground/90 whitespace-pre-wrap mb-3">
        {tweet.text}
      </p>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <HiHeart className="size-3.5" />
          {tweet.likes.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <HiArrowPath className="size-3.5" />
          {tweet.retweets.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <HiChatBubbleLeft className="size-3.5" />
          {tweet.replies.toLocaleString()}
        </span>
      </div>
    </Card>
  );
}
