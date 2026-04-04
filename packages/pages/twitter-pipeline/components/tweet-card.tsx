'use client';

import type { ITwitterSearchResult } from '@cloud/interfaces';
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
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
          {tweet.authorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-foreground truncate">
              {tweet.authorName}
            </span>
            <HiCheckBadge className="w-4 h-4 text-primary shrink-0" />
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
          <HiHeart className="w-3.5 h-3.5" />
          {tweet.likes.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <HiArrowPath className="w-3.5 h-3.5" />
          {tweet.retweets.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <HiChatBubbleLeft className="w-3.5 h-3.5" />
          {tweet.replies.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
