import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AnalyticsMetric } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface TopContentEntry {
  date?: Date | string;
  description?: string;
  engagementRate?: number;
  isVideo?: boolean;
  label?: string;
  platform?: string;
  totalEngagement?: number;
  totalViews?: number;
}

export interface CampaignWinnerExtractionResult {
  campaignId: string;
  extractedCount: number;
  memoryId?: string;
  skippedReason?: string;
  summary: string;
}

@Injectable()
export class CampaignWinnerExtractionService {
  private readonly logContext = this.constructor.name;

  constructor(
    private readonly agentCampaignsService: AgentCampaignsService,
    private readonly analyticsService: AnalyticsService,
    private readonly agentMemoryCaptureService: AgentMemoryCaptureService,
    private readonly logger: LoggerService,
  ) {}

  async extractWinnerPatterns(
    campaignId: string,
    organizationId: string,
  ): Promise<CampaignWinnerExtractionResult> {
    const campaign = await this.agentCampaignsService.findOne({
      _id: campaignId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!campaign) {
      throw new NotFoundException('Campaign', campaignId);
    }

    if (campaign.status !== 'active') {
      return {
        campaignId,
        extractedCount: 0,
        skippedReason: `Campaign is ${campaign.status}, skipping winner extraction.`,
        summary: `Skipped winner extraction because campaign status is ${campaign.status}.`,
      };
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const topContent = (await this.analyticsService.getTopContent(
      startDate.toISOString(),
      now.toISOString(),
      5,
      AnalyticsMetric.ENGAGEMENT,
      campaign.brand ? String(campaign.brand) : undefined,
      undefined,
      String(campaign.organization),
    )) as TopContentEntry[];

    if (topContent.length === 0) {
      return {
        campaignId,
        extractedCount: 0,
        skippedReason:
          'No top-performing content found for this campaign window.',
        summary:
          'Skipped winner extraction because no top-performing content was available for the last 30 days.',
      };
    }

    const patternSummary = this.buildWinnerPatternSummary(topContent);
    const topLabels = topContent
      .map((entry) => entry.label?.trim())
      .filter((label): label is string => Boolean(label))
      .slice(0, 3);
    const avgViews =
      topContent.reduce((sum, entry) => sum + (entry.totalViews ?? 0), 0) /
      topContent.length;
    const avgEngagementRate =
      topContent.reduce((sum, entry) => sum + (entry.engagementRate ?? 0), 0) /
      topContent.length;

    const content = [
      `Top-performing campaign content in the last 30 days clusters around ${patternSummary.format} on ${patternSummary.platform}.`,
      `The dominant tone is ${patternSummary.tone} and the best posting window is ${patternSummary.daypart}.`,
      topLabels.length > 0
        ? `Representative winners: ${topLabels.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const capture = await this.agentMemoryCaptureService.capture(
      String(campaign.user),
      String(campaign.organization),
      {
        brandId: campaign.brand ? String(campaign.brand) : undefined,
        campaignId,
        confidence: 0.75,
        content,
        contentType: patternSummary.contentType,
        importance: 0.85,
        kind: 'winner',
        performanceSnapshot: {
          averageEngagementRate: Number(avgEngagementRate.toFixed(2)),
          averageViews: Math.round(avgViews),
          dominantDaypart: patternSummary.daypart,
          dominantFormat: patternSummary.format,
          dominantPlatform: patternSummary.platform,
          dominantTone: patternSummary.tone,
          sampleSize: topContent.length,
        },
        scope: 'campaign',
        sourceContentId: String(campaign.id),
        sourceType: 'campaign-winner-extraction',
        summary: `Winner pattern extracted from ${topContent.length} top-performing post(s).`,
        tags: [
          `campaign:${String(campaign.id)}`,
          `daypart:${patternSummary.daypart}`,
          `format:${patternSummary.format}`,
          `platform:${patternSummary.platform}`,
          `tone:${patternSummary.tone}`,
          'winner-extraction',
        ],
      },
    );

    const summary = `Extracted campaign winner pattern from ${topContent.length} top-performing post(s): ${patternSummary.format} on ${patternSummary.platform}, ${patternSummary.tone} tone, ${patternSummary.daypart} posting window.`;

    this.logger.log(`${this.logContext} extracted winner pattern`, {
      campaignId,
      memoryId: String(capture.memory.id),
      summary,
    });

    return {
      campaignId,
      extractedCount: topContent.length,
      memoryId: String(capture.memory.id),
      summary,
    };
  }

  private buildWinnerPatternSummary(topContent: TopContentEntry[]): {
    contentType: 'article' | 'generic' | 'post';
    daypart: string;
    format: string;
    platform: string;
    tone: string;
  } {
    const platform = this.pickMostFrequent(
      topContent
        .map((entry) => entry.platform?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
      'unknown-platform',
    );
    const daypart = this.pickMostFrequent(
      topContent.map((entry) => this.resolveDaypart(entry.date)),
      'unknown-time',
    );
    const tone = this.pickMostFrequent(
      topContent.map((entry) => this.resolveTone(entry.description)),
      'neutral',
    );

    const videoCount = topContent.filter((entry) => entry.isVideo).length;
    const format =
      videoCount >= Math.ceil(topContent.length / 2) ? 'video' : 'post';

    return {
      contentType: format === 'video' ? 'post' : 'generic',
      daypart,
      format,
      platform,
      tone,
    };
  }

  private pickMostFrequent(values: string[], fallback: string): string {
    if (values.length === 0) {
      return fallback;
    }

    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return (
      Array.from(counts.entries()).sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })[0]?.[0] ?? fallback
    );
  }

  private resolveDaypart(dateValue?: Date | string): string {
    if (!dateValue) {
      return 'unknown-time';
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return 'unknown-time';
    }

    const hour = parsed.getUTCHours();
    if (hour < 6) {
      return 'late-night';
    }

    if (hour < 12) {
      return 'morning';
    }

    if (hour < 18) {
      return 'afternoon';
    }

    return 'evening';
  }

  private resolveTone(description?: string): string {
    const normalized = description?.trim().toLowerCase() ?? '';
    if (!normalized) {
      return 'neutral';
    }

    if (normalized.includes('?')) {
      return 'question-led';
    }

    if (
      normalized.includes('how to') ||
      normalized.includes('tips') ||
      normalized.includes('guide')
    ) {
      return 'educational';
    }

    if (
      normalized.includes('i ') ||
      normalized.includes('we ') ||
      normalized.includes('my ')
    ) {
      return 'storytelling';
    }

    if (
      normalized.includes('buy') ||
      normalized.includes('sale') ||
      normalized.includes('offer')
    ) {
      return 'promotional';
    }

    if (normalized.includes('you')) {
      return 'conversational';
    }

    return 'directive';
  }
}
