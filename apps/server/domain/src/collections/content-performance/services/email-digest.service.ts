import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  PerformanceSummaryService,
  type WeeklySummary,
} from '@server/collections/content-performance/services/performance-summary.service';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerNotifications,
  type ServerPrisma,
} from '@server/server.dependencies';

export interface EmailDigestResult {
  sent: number;
  skipped: number;
  errors: number;
}

export interface EmailDigestOptions {
  organizationId: string;
  brandId: string;
  /** Override recipients (defaults to org owner) */
  recipientEmails?: string[];
  /** Date range for summary */
  startDate?: Date | string;
  endDate?: Date | string;
}

@Injectable()
export class EmailDigestService {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
    @Inject(SERVER_TOKENS.notifications)
    private readonly notificationsService: ServerNotifications,
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: ServerPrisma,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  /**
   * Send a performance digest email for an organization/brand.
   */
  async sendDigest(options: EmailDigestOptions): Promise<EmailDigestResult> {
    const { organizationId, brandId, startDate, endDate } = options;

    const result: EmailDigestResult = { errors: 0, sent: 0, skipped: 0 };

    try {
      // Get the weekly summary
      const summary = await this.performanceSummaryService.getWeeklySummary(
        organizationId,
        brandId,
        { endDate: endDate as string, startDate: startDate as string },
      );

      // Determine recipients
      const recipients = await this.resolveRecipients(
        organizationId,
        options.recipientEmails,
      );

      if (recipients.length === 0) {
        this.logger.warn(
          `No recipients found for digest email org=${organizationId}`,
        );
        result.skipped++;
        return result;
      }

      // Get org name for email subject
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });
      const orgName = org?.label ?? 'Your Organization';

      // Build email HTML
      const html = this.buildDigestHtml(summary, orgName);
      const subject = `Weekly Performance Digest - ${orgName}`;

      // Send to each recipient
      for (const email of recipients) {
        try {
          await this.notificationsService.sendEmail(email, subject, html);
          result.sent++;
        } catch (error) {
          result.errors++;
          this.logger.error(`Failed to send digest email to ${email}`, error);
        }
      }
    } catch (error) {
      result.errors++;
      this.logger.error(
        `Failed to generate digest for org=${organizationId}`,
        error,
      );
    }

    return result;
  }

  /**
   * Resolve email recipients — use provided list or fall back to org owner.
   */
  private async resolveRecipients(
    organizationId: string,
    overrideEmails?: string[],
  ): Promise<string[]> {
    if (overrideEmails && overrideEmails.length > 0) {
      return overrideEmails;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org?.userId) return [];

    const user = await this.prisma.user.findUnique({
      where: { id: org.userId },
    });

    if (!user?.email) return [];

    return [user.email];
  }

  /**
   * Build the HTML email body from a WeeklySummary.
   */
  buildDigestHtml(summary: WeeklySummary, orgName: string): string {
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
          ? '#ef4444'
          : '#8c8c96';
    const trendPct = Math.abs(trend.percentageChange).toFixed(1);

    const topPerformersHtml = summary.topPerformers
      .slice(0, 5)
      .map(
        (p, i) => `
        <tr>
          <td style="border-bottom:1px solid #1e2022;color:#8c8c96;padding:8px;">${i + 1}</td>
          <td style="border-bottom:1px solid #1e2022;color:#f4f4f5;padding:8px;">${this.escapeHtml(p.title || p.description || 'Untitled').substring(0, 60)}</td>
          <td style="border-bottom:1px solid #1e2022;color:#b4b4bc;padding:8px;">${this.escapeHtml(p.platform)}</td>
          <td style="border-bottom:1px solid #1e2022;color:#b4b4bc;padding:8px;">${p.engagementRate.toFixed(2)}%</td>
          <td style="border-bottom:1px solid #1e2022;color:#b4b4bc;padding:8px;">${this.formatNumber(p.views)}</td>
        </tr>`,
      )
      .join('');

    const platformHtml = summary.avgEngagementByPlatform
      .map(
        (p) => `
        <tr>
          <td style="border-bottom:1px solid #1e2022;color:#f4f4f5;padding:8px;">${this.escapeHtml(p.platform)}</td>
          <td style="border-bottom:1px solid #1e2022;color:#b4b4bc;padding:8px;">${p.avgEngagementRate.toFixed(2)}%</td>
          <td style="border-bottom:1px solid #1e2022;color:#b4b4bc;padding:8px;">${p.totalPosts}</td>
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

    const bodyHtml = `
  <p style="color:#b4b4bc;font-size:15px;line-height:24px;margin:0 0 18px;">Report for <strong style="color:#f4f4f5;">${this.escapeHtml(orgName)}</strong></p>

  <div style="background:#131518;border:1px solid #333538;border-radius:8px;padding:16px;margin:0 0 24px;">
    <h2 style="color:#f4f4f5;font-size:16px;line-height:22px;margin:0 0 8px;">Week-over-Week Trend</h2>
    <p style="margin:0;font-size:28px;font-weight:700;line-height:34px;color:${trendColor};">
      ${trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}${trendPct}%
    </p>
    <p style="margin:4px 0 0;color:#8c8c96;font-size:13px;line-height:20px;">
      ${trendLabel} from ${this.formatNumber(trend.previousEngagement)} to ${this.formatNumber(trend.currentEngagement)} engagements.
    </p>
  </div>

  <h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Top Performers</h2>
  ${
    summary.topPerformers.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead>
      <tr>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">#</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Content</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Platform</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Engagement</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Views</th>
      </tr>
    </thead>
    <tbody>${topPerformersHtml}</tbody>
  </table>`
      : '<p style="color:#8c8c96;margin:0 0 16px;">No performance data this week.</p>'
  }

  <h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Platform Breakdown</h2>
  ${
    summary.avgEngagementByPlatform.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead>
      <tr>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Platform</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Avg Engagement</th>
        <th style="color:#8c8c96;font-weight:700;padding:8px;text-align:left;">Posts</th>
      </tr>
    </thead>
    <tbody>${platformHtml}</tbody>
  </table>`
      : '<p style="color:#8c8c96;margin:0 0 16px;">No platform data available.</p>'
  }

  <h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Best Posting Times</h2>
  ${bestTimesHtml ? `<ul style="color:#b4b4bc;font-size:14px;line-height:22px;margin:0 0 16px;padding-left:18px;">${bestTimesHtml}</ul>` : '<p style="color:#8c8c96;margin:0 0 16px;">Not enough data yet.</p>'}

  ${
    summary.topHooks.length > 0
      ? `<h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Top Hooks</h2>
  <ol style="color:#b4b4bc;font-size:14px;line-height:22px;margin:0 0 16px;padding-left:18px;">
    ${summary.topHooks.map((h) => `<li>"${this.escapeHtml(h.substring(0, 80))}"</li>`).join('')}
  </ol>`
      : ''
  }`;

    return buildSystemEmailHtml({
      bodyHtml,
      footerNote:
        'This is an automated performance digest. To unsubscribe, update your notification preferences in Genfeed.',
      title: 'Weekly Performance Digest',
    });
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
