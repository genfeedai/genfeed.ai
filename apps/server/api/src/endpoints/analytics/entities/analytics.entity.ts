import type { Analytic } from '@genfeedai/prisma';

export class AnalyticEntity implements Analytic {
  declare readonly id: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly data: Analytic['data'];
  declare readonly totalClaimed: number;
  declare readonly totalHoursWatched: number;
  declare readonly totalVideos: number;
  declare readonly totalImages: number;

  constructor(partial: Partial<Analytic>) {
    Object.assign(this, partial);
  }
}
