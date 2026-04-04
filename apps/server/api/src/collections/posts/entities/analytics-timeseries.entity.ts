export class TimeSeriesDataPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  totalEngagement: number;

  constructor(data: unknown) {
    this.date = data.date;
    this.views = data.views || 0;
    this.likes = data.likes || 0;
    this.comments = data.comments || 0;
    this.shares = data.shares || 0;
    this.saves = data.saves || 0;
    this.engagementRate = data.engagementRate || 0;
    this.totalEngagement = data.totalEngagement || 0;
  }
}

export class AnalyticsTimeSeriesEntity {
  data: TimeSeriesDataPoint[];

  constructor(data: TimeSeriesDataPoint[]) {
    this.data = data.map((item) => new TimeSeriesDataPoint(item));
  }
}
