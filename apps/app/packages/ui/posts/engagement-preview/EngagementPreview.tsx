'use client';

import { CredentialPlatform } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { HiChartBar } from 'react-icons/hi2';

const PLATFORM_BENCHMARKS: Record<
  string,
  { avgEngRate: number; reachMultiplier: number }
> = {
  [CredentialPlatform.INSTAGRAM]: { avgEngRate: 1.6, reachMultiplier: 0.2 },
  [CredentialPlatform.TWITTER]: { avgEngRate: 0.05, reachMultiplier: 0.03 },
  [CredentialPlatform.TIKTOK]: { avgEngRate: 5.96, reachMultiplier: 0.15 },
  [CredentialPlatform.YOUTUBE]: { avgEngRate: 1.9, reachMultiplier: 0.1 },
  [CredentialPlatform.FACEBOOK]: { avgEngRate: 0.13, reachMultiplier: 0.06 },
  [CredentialPlatform.LINKEDIN]: { avgEngRate: 0.35, reachMultiplier: 0.08 },
};

export interface EngagementPreviewProps {
  post: IPost;
  followerCount?: number;
  historicalAvgViews?: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toFixed(0);
}

export default function EngagementPreview({
  post,
  followerCount = 1000,
  historicalAvgViews,
}: EngagementPreviewProps) {
  const benchmark = PLATFORM_BENCHMARKS[post.platform ?? ''];
  if (!benchmark) {
    return null;
  }

  const estimatedReach =
    historicalAvgViews ?? Math.round(followerCount * benchmark.reachMultiplier);
  const estimatedLikes = Math.round(
    estimatedReach * (benchmark.avgEngRate / 100),
  );
  const estimatedComments = Math.round(estimatedLikes * 0.1);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <HiChartBar className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Estimated Engagement</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-bold">{formatNumber(estimatedReach)}</p>
          <p className="text-xs text-muted-foreground">Reach</p>
        </div>
        <div>
          <p className="text-lg font-bold">{formatNumber(estimatedLikes)}</p>
          <p className="text-xs text-muted-foreground">Likes</p>
        </div>
        <div>
          <p className="text-lg font-bold">{formatNumber(estimatedComments)}</p>
          <p className="text-xs text-muted-foreground">Comments</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Based on platform averages · Actual results may vary
      </p>
    </Card>
  );
}
