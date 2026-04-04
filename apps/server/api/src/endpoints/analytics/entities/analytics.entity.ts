import { Analytic } from '@api/endpoints/analytics/schemas/analytic.schema';

export class AnalyticEntity implements Analytic {
  declare readonly totalClaimed: number;
  declare readonly totalHoursWatched: number;
  declare readonly totalVideos: number;
  declare readonly totalImages: number;

  constructor(partial: Partial<Analytic>) {
    Object.assign(this, partial);
  }
}
