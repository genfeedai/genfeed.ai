export interface ICreatorWatchlist {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  followers: number;
  avgViews: number;
  avgEngagementRate: number;
  growthRate: number;
  postingCadence: string;
  contentPillar: string;
  collaborationReady?: boolean;
}
