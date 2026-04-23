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
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    this.date = typeof record.date === 'string' ? record.date : '';
    this.views = this.asNumber(record.views);
    this.likes = this.asNumber(record.likes);
    this.comments = this.asNumber(record.comments);
    this.shares = this.asNumber(record.shares);
    this.saves = this.asNumber(record.saves);
    this.engagementRate = this.asNumber(record.engagementRate);
    this.totalEngagement = this.asNumber(record.totalEngagement);
  }

  private asNumber(value: unknown): number {
    return typeof value === 'number' ? value : 0;
  }
}

export class AnalyticsTimeSeriesEntity {
  data: TimeSeriesDataPoint[];

  constructor(data: TimeSeriesDataPoint[]) {
    this.data = data.map((item) => new TimeSeriesDataPoint(item));
  }
}
