import { compareCampaignEntries } from '@api/collections/campaigns/services/campaign-comparison';
import { CampaignPerformanceService } from '@api/collections/campaigns/services/campaign-performance.service';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import type {
  CampaignComparisonMetric,
  ICampaignComparison,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class CampaignComparisonService {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly performance: CampaignPerformanceService,
  ) {}

  async compare(
    organizationId: string,
    campaignIds: string[],
    query: {
      endDate?: string;
      metric?: CampaignComparisonMetric;
      startDate?: string;
    } = {},
  ): Promise<ICampaignComparison> {
    const uniqueIds = [...new Set(campaignIds.filter(Boolean))];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Comparison needs at least two Campaigns');
    }
    const metric = query.metric === 'engagements' ? 'engagements' : 'views';
    const entries = await Promise.all(
      uniqueIds.map(async (campaignId) => {
        const campaign = await this.campaigns.getOne(
          organizationId,
          campaignId,
        );
        const performance = await this.performance.getPerformance(
          organizationId,
          campaignId,
          { endDate: query.endDate, startDate: query.startDate },
        );
        return {
          campaign,
          organic: performance.organic,
          windowEnd: performance.windowEnd,
          windowStart: performance.windowStart,
        };
      }),
    );
    const result = compareCampaignEntries(entries, metric);
    return {
      ...result,
      entries,
      id: uniqueIds.join(':'),
    };
  }
}
