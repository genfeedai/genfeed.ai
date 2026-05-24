import type { AnalyticDocument } from '@api/endpoints/analytics/schemas/analytic.schema';

export class AnalyticEntity implements AnalyticDocument {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly data: AnalyticDocument['data'];
  declare readonly totalClaimed: number;
  declare readonly totalHoursWatched: number;
  declare readonly totalVideos: number;
  declare readonly totalImages: number;

  constructor(partial: Partial<AnalyticDocument>) {
    Object.assign(this, partial);
  }
}
