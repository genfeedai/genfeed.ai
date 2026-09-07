export type AggregatedPlatform = {
  platform: string;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  avgEngagement: number;
  avgViralScore: number;
  videoCount: number;
};

export type Props = {
  aggregatedPlatformData: AggregatedPlatform[];
};
