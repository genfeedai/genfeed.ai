import {
  buildRecordNextPrompt,
  derivePatternText,
  resolveWeakestPositioningDimension,
} from '@api/collections/content-performance/services/email-digest-expert.util';
import {
  PerformanceSummaryService,
  type WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@api/server.dependencies';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { OrganizationCategory } from '@genfeedai/contracts';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

export interface EmailDigestResult {
  sent: number;
  queued: number;
  skipped: number;
  errors: number;
}

export interface EmailDigestOptions {
  organizationId: string;
  brandId: string;
  /** Optional active organization members; external email addresses are rejected. */
  recipientEmails?: string[];
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface EmailDigestExpertWinner {
  content: string;
  platform: string;
  engagementRate: number;
}

/**
 * Expert Path "What won" / "Record next" digest sections. `isExpert: false`
 * for non-EXPERT organizations, and rendering skips the sections entirely in
 * that case — see {@link EmailDigestService.buildDigestHtml}.
 */
export interface EmailDigestExpertData {
  isExpert: boolean;
  winners: EmailDigestExpertWinner[];
  patternText: string | null;
  recordNextPrompt: string;
  corpusUrl: string;
}

export interface EmailDigestPrepared {
  options: EmailDigestOptions;
  organizationName: string;
  destinationUrl: string;
  summary: WeeklySummary;
  expert: EmailDigestExpertData;
}

export interface EmailDigestDelivery {
  userId: string;
  organizationId: string;
  brandId: string;
  startDate: string;
  endDate: string;
  destinationUrl: string;
  html: string;
  subject: string;
}

export interface EmailDigestRecipientResult {
  userId: string;
  queued: boolean;
  deliveryId?: string;
  error?: string;
}

export interface EmailDigestRendered {
  deliveries: EmailDigestDelivery[];
}

@Injectable()
export class EmailDigestService {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly emailPerformance: EmailPerformanceService,
    @Inject(SERVER_TOKENS.prisma) private readonly prisma: ServerPrisma,
    @Inject(SERVER_TOKENS.logger) private readonly logger: ServerLogger,
    private readonly config: ConfigService,
    private readonly harnessWinnerPromotion: HarnessWinnerPromotionService,
    private readonly creativePatterns: CreativePatternsService,
    private readonly harnessProfiles: HarnessProfilesService,
  ) {}

  normalizeOptions<T extends EmailDigestOptions>(
    options: T,
  ): T & { startDate: string; endDate: string } {
    try {
      const range = DateRangeUtil.parseDateRange(
        options.startDate,
        options.endDate,
      );
      const duration = range.endDate.getTime() - range.startDate.getTime();
      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration >= 90 * 86_400_000
      )
        throw new Error('Invalid range');
      return {
        ...options,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
      };
    } catch {
      throw new BadRequestException(
        'Choose a valid digest period of 2–90 complete UTC days.',
      );
    }
  }

  async prepareDigest(
    options: EmailDigestOptions,
  ): Promise<EmailDigestPrepared> {
    const normalized = this.normalizeOptions(options);
    const [organization, brand] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: options.organizationId, isDeleted: false },
        select: { label: true, slug: true, accountType: true },
      }),
      this.prisma.brand.findFirst({
        where: {
          id: options.brandId,
          organizationId: options.organizationId,
          isDeleted: false,
        },
        select: { slug: true },
      }),
    ]);
    if (!organization || !brand)
      throw new BadRequestException(
        'Digest organization or brand is unavailable.',
      );
    const appUrl = (
      this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai'
    ).replace(/\/$/, '');
    const destinationUrl = `${appUrl}/${encodeURIComponent(organization.slug)}/${encodeURIComponent(brand.slug)}/library/assets`;
    const corpusUrl = `${appUrl}/${encodeURIComponent(organization.slug)}/${encodeURIComponent(brand.slug)}/settings/knowledge`;
    const summary = await this.performanceSummaryService.getWeeklySummary(
      options.organizationId,
      options.brandId,
      normalized,
    );
    const expert =
      organization.accountType === OrganizationCategory.EXPERT
        ? await this.buildExpertDigestData({
            brandId: options.brandId,
            corpusUrl,
            from: new Date(normalized.startDate),
            organizationId: options.organizationId,
            to: new Date(normalized.endDate),
          })
        : {
            corpusUrl,
            isExpert: false,
            patternText: null,
            recordNextPrompt: '',
            winners: [],
          };
    return {
      options: normalized,
      organizationName: organization.label ?? 'Your Organization',
      destinationUrl,
      summary,
      expert,
    };
  }

  /**
   * Assembles the Expert Path "What won" / "Record next" digest data for one
   * brand + window. Only called for organizations whose `accountType` is
   * `OrganizationCategory.EXPERT` — see {@link prepareDigest}.
   */
  private async buildExpertDigestData(params: {
    organizationId: string;
    brandId: string;
    from: Date;
    to: Date;
    corpusUrl: string;
  }): Promise<EmailDigestExpertData> {
    const [winners, patterns, profile] = await Promise.all([
      this.harnessWinnerPromotion.listPromotedWinners({
        brandId: params.brandId,
        from: params.from,
        limit: 5,
        organizationId: params.organizationId,
        to: params.to,
      }),
      this.creativePatterns.findTopForBrand(
        params.organizationId,
        params.brandId,
        { limit: 1 },
      ),
      this.harnessProfiles.getActiveForBrand(
        params.organizationId,
        params.brandId,
      ),
    ]);

    const topWinner = winners[0]
      ? { content: winners[0].content, platform: winners[0].platform }
      : null;
    const patternText = derivePatternText(patterns[0] ?? null, topWinner);
    const weakestDimension = resolveWeakestPositioningDimension(
      profile?.positioning?.weakestDimension,
    );
    const recordNextPrompt = buildRecordNextPrompt({
      hasWinners: winners.length > 0,
      patternText,
      weakestDimension,
    });

    return {
      corpusUrl: params.corpusUrl,
      isExpert: true,
      patternText,
      recordNextPrompt,
      winners: winners.map((winner) => ({
        content: winner.content,
        engagementRate: winner.engagementRate ?? 0,
        platform: winner.platform ?? 'unknown',
      })),
    };
  }

  async discoverDigestRecipients(
    prepared: EmailDigestPrepared,
  ): Promise<EmailDigestPrepared & { recipientUserIds: string[] }> {
    return {
      ...prepared,
      recipientUserIds: await this.resolveRecipients(
        prepared.options.organizationId,
        prepared.options.recipientEmails,
      ),
    };
  }

  renderDigest(
    state: EmailDigestPrepared & { recipientUserIds: string[] },
  ): EmailDigestRendered {
    const normalized = this.normalizeOptions(state.options);
    const html = this.buildDigestHtml(
      state.summary,
      state.organizationName,
      state.destinationUrl,
      state.expert,
    );
    const subject = `Weekly Performance Digest - ${state.organizationName}`;
    return {
      deliveries: state.recipientUserIds.map((userId) => ({
        userId,
        organizationId: normalized.organizationId,
        brandId: normalized.brandId,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        destinationUrl: state.destinationUrl,
        html,
        subject,
      })),
    };
  }

  async deliverDigestRecipient(
    input: EmailDigestDelivery,
  ): Promise<EmailDigestRecipientResult> {
    try {
      if (
        !input.userId ||
        !input.organizationId ||
        !input.brandId ||
        !input.startDate ||
        !input.endDate ||
        !input.destinationUrl
      )
        throw new BadRequestException(
          'Digest requires a canonical member and explicit report window.',
        );
      const deliveryId = await this.emailPerformance.queueEmail({
        userId: input.userId,
        organizationId: input.organizationId,
        // An explicitly requested brand report, not the automated weekly recap.
        // Sharing 'content.weekly' let the recap toggle silently drop it.
        topic: 'content.digest',
        templateKey: 'performance-digest',
        subject: input.subject,
        html: input.html,
        destinationUrl: input.destinationUrl,
        goal: 'publish_content',
        idempotencyKey: `performance-digest/${input.brandId}/${input.startDate}/${input.endDate}`,
        policyData: { brandId: input.brandId },
      });
      return { userId: input.userId, queued: true, deliveryId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to queue digest email', error);
      return { userId: input.userId, error: message, queued: false };
    }
  }

  private async resolveRecipients(
    organizationId: string,
    overrideEmails?: string[],
  ): Promise<string[]> {
    const emails = [
      ...new Set(
        (overrideEmails ?? []).map((email) => email.trim().toLowerCase()),
      ),
    ];
    if (emails.length > 50 || emails.some((email) => !email))
      throw new BadRequestException(
        'Choose no more than 50 active organization members.',
      );
    if (emails.length > 0) {
      const members = await this.prisma.member.findMany({
        where: {
          organizationId,
          isDeleted: false,
          isActive: true,
          user: {
            is: {
              isDeleted: false,
              email: { in: emails, mode: 'insensitive' },
            },
          },
        },
        select: { user: { select: { id: true, email: true } } },
      });
      const resolvedEmails = new Set(
        members.map((member) => member.user.email?.trim().toLowerCase()),
      );
      if (emails.some((email) => !resolvedEmails.has(email)))
        throw new BadRequestException(
          'Digest recipients must be active members of this organization.',
        );
      return [...new Set(members.map((member) => member.user.id))];
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { userId: true },
    });
    if (!org?.userId) return [];
    const member = await this.prisma.member.findFirst({
      where: {
        organizationId,
        userId: org.userId,
        isDeleted: false,
        isActive: true,
        user: { is: { isDeleted: false, email: { not: null } } },
      },
      select: { userId: true },
    });
    return member ? [member.userId] : [];
  }

  /**
   * Build the HTML email body from a WeeklySummary.
   */
  buildDigestHtml(
    summary: WeeklySummary,
    orgName: string,
    destinationUrl?: string,
    expert?: EmailDigestExpertData,
  ): string {
    const trend = summary.weekOverWeekTrend;
    const trendLabel =
      trend.direction === 'up'
        ? 'Up'
        : trend.direction === 'down'
          ? 'Down'
          : 'Flat';
    const trendColor =
      trend.direction === 'up'
        ? '#10b981'
        : trend.direction === 'down'
          ? '#FF6166'
          : '#949494';
    const trendPct = Math.abs(trend.percentageChange).toFixed(1);

    const topPerformersHtml = summary.topPerformers
      .slice(0, 5)
      .map(
        (p, i) => `
        <tr>
          <td style="border-bottom:1px solid #333333;color:#949494;padding:8px;">${i + 1}</td>
          <td style="border-bottom:1px solid #333333;color:#EDEDED;padding:8px;">${this.escapeHtml(p.title || p.description || 'Untitled').substring(0, 60)}</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${this.escapeHtml(p.platform)}</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${p.engagementRate.toFixed(2)}%</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${this.formatNumber(p.views)}</td>
        </tr>`,
      )
      .join('');

    const platformHtml = summary.avgEngagementByPlatform
      .map(
        (p) => `
        <tr>
          <td style="border-bottom:1px solid #333333;color:#EDEDED;padding:8px;">${this.escapeHtml(p.platform)}</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${p.avgEngagementRate.toFixed(2)}%</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${p.totalPosts}</td>
        </tr>`,
      )
      .join('');

    const bestTimesHtml = summary.bestPostingTimes
      .slice(0, 3)
      .map((t) => {
        const period = t.hour >= 12 ? 'PM' : 'AM';
        const displayHour = t.hour > 12 ? t.hour - 12 : t.hour || 12;
        return `<li style="margin:0 0 8px;">${displayHour}:00 ${period} (${t.avgEngagementRate.toFixed(2)}% avg engagement, ${t.postCount} posts)</li>`;
      })
      .join('');

    const expertHtml = expert?.isExpert
      ? this.buildExpertDigestSectionsHtml(expert)
      : '';

    const bodyHtml = `
  <p style="color:#A1A1A1;font-size:15px;line-height:24px;margin:0 0 18px;">Report for <strong style="color:#EDEDED;">${this.escapeHtml(orgName)}</strong></p>

  <div style="background:#1F1F1F;border:1px solid #333333;border-radius:8px;padding:16px;margin:0 0 24px;">
    <h2 style="color:#EDEDED;font-size:16px;line-height:22px;margin:0 0 8px;">Week-over-Week Trend</h2>
    <p style="margin:0;font-size:28px;font-weight:700;line-height:34px;color:${trendColor};">
      ${trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}${trendPct}%
    </p>
    <p style="margin:4px 0 0;color:#949494;font-size:13px;line-height:20px;">
      ${trendLabel} from ${this.formatNumber(trend.previousEngagement)} to ${this.formatNumber(trend.currentEngagement)} engagements.
    </p>
  </div>

  <h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Top Performers</h2>
  ${
    summary.topPerformers.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead>
      <tr>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">#</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Content</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Platform</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Engagement</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Views</th>
      </tr>
    </thead>
    <tbody>${topPerformersHtml}</tbody>
  </table>`
      : '<p style="color:#949494;margin:0 0 16px;">No performance data this week.</p>'
  }

  <h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Platform Breakdown</h2>
  ${
    summary.avgEngagementByPlatform.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead>
      <tr>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Platform</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Avg Engagement</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Posts</th>
      </tr>
    </thead>
    <tbody>${platformHtml}</tbody>
  </table>`
      : '<p style="color:#949494;margin:0 0 16px;">No platform data available.</p>'
  }

  <h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Best Posting Times</h2>
  ${bestTimesHtml ? `<ul style="color:#A1A1A1;font-size:14px;line-height:22px;margin:0 0 16px;padding-left:18px;">${bestTimesHtml}</ul>` : '<p style="color:#949494;margin:0 0 16px;">Not enough data yet.</p>'}

  ${
    summary.topHooks.length > 0
      ? `<h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Top Hooks</h2>
  <ol style="color:#A1A1A1;font-size:14px;line-height:22px;margin:0 0 16px;padding-left:18px;">
    ${summary.topHooks.map((h) => `<li>"${this.escapeHtml(h.substring(0, 80))}"</li>`).join('')}
  </ol>`
      : ''
  }${expertHtml ? `\n  ${expertHtml}` : ''}`;

    const html = buildSystemEmailHtml({
      bodyHtml,
      action: destinationUrl
        ? { label: 'Review and publish content', url: destinationUrl }
        : undefined,
      footerNote:
        'This is an automated performance digest. To unsubscribe, update your notification preferences in Genfeed.',
      title: 'Weekly Performance Digest',
    });
    return destinationUrl
      ? html.replaceAll(
          escapeSystemEmailHtml(destinationUrl),
          '{{emailActionUrl}}',
        )
      : html;
  }

  /**
   * Renders the Expert Path "What won" and "Record next" sections. Only
   * invoked when `expert.isExpert` is true, so non-EXPERT digests never call
   * this and keep their existing HTML byte-for-byte.
   */
  private buildExpertDigestSectionsHtml(expert: EmailDigestExpertData): string {
    const winnersHtml =
      expert.winners.length > 0
        ? `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead>
      <tr>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Content</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Platform</th>
        <th style="color:#949494;font-weight:700;padding:8px;text-align:left;">Score</th>
      </tr>
    </thead>
    <tbody>${expert.winners
      .map(
        (winner) => `
        <tr>
          <td style="border-bottom:1px solid #333333;color:#EDEDED;padding:8px;">${this.escapeHtml(winner.content).substring(0, 120)}</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${this.escapeHtml(winner.platform)}</td>
          <td style="border-bottom:1px solid #333333;color:#A1A1A1;padding:8px;">${winner.engagementRate.toFixed(2)}%</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table>
  ${
    expert.patternText
      ? `<p style="margin:12px 0 0;color:#A1A1A1;font-size:14px;line-height:22px;">The pattern behind it: ${this.escapeHtml(expert.patternText)}</p>`
      : ''
  }`
        : '<p style="color:#949494;margin:0 0 16px;">No ideas were promoted this week.</p>';

    return `
  <h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">What won</h2>
  ${winnersHtml}

  <h2 style="border-bottom:1px solid #333333;color:#EDEDED;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Record next</h2>
  <p style="margin:0 0 8px;color:#A1A1A1;font-size:14px;line-height:22px;">${this.escapeHtml(expert.recordNextPrompt)}</p>
  <p style="margin:0;font-size:14px;line-height:22px;"><a href="${this.escapeHtml(expert.corpusUrl)}" style="color:#EDEDED;text-decoration:underline;">Add to your knowledge corpus</a></p>`;
  }

  private escapeHtml(text: string): string {
    return escapeSystemEmailHtml(text);
  }

  private formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  }
}
