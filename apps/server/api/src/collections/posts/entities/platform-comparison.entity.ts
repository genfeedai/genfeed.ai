export class PlatformComparisonItem {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  postCount: number;
  avgViewsPerPost: number;

  constructor(data: Partial<PlatformComparisonItem>) {
    // @ts-expect-error TS2322
    this.platform = data.platform;
    this.views = data.views || 0;
    this.likes = data.likes || 0;
    this.comments = data.comments || 0;
    this.shares = data.shares || 0;
    this.saves = data.saves || 0;
    this.engagementRate = data.engagementRate || 0;
    this.postCount = data.postCount || 0;
    this.avgViewsPerPost = data.avgViewsPerPost || 0;
  }
}

export class PlatformComparisonEntity {
  platforms: PlatformComparisonItem[];

  constructor(data: PlatformComparisonItem[]) {
    this.platforms = data.map((item) => new PlatformComparisonItem(item));
  }
}
