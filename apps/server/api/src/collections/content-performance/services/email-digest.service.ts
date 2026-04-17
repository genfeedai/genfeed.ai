import {
  PerformanceSummaryService,
  type WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
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
      const subject = `📊 Weekly Performance Digest — ${orgName}`;

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
    const trendEmoji =
      trend.direction === 'up' ? '📈' : trend.direction === 'down' ? '📉' : '➡️';
    const trendPct = Math.abs(trend.percentageChange).toFixed(1);

    const topPerformersHtml = summary.topPerformers
      .slice(0, 5)
      .map(
        (p, i) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${this.escapeHtml(p.title || p.description || 'Untitled').substring(0, 60)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${p.platform}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${p.engagementRate.toFixed(2)}%</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${this.formatNumber(p.views)}</td>
        </tr>`,
      )
      .join('');

    const platformHtml = summary.avgEngagementByPlatform
      .map(
        (p) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${p.platform}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${p.avgEngagementRate.toFixed(2)}%</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${p.totalPosts}</td>
        </tr>`,
      )
      .join('');

    const bestTimesHtml = summary.bestPostingTimes
      .slice(0, 3)
      .map((t) => {
        const period = t.hour >= 12 ? 'PM' : 'AM';
        const displayHour = t.hour > 12 ? t.hour - 12 : t.hour || 12;
        return `<li>${displayHour}:00 ${period} (${t.avgEngagementRate.toFixed(2)}% avg engagement, ${t.postCount} posts)</li>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h1 style="color:#1a1a2e;border-bottom:2px solid #e94560;padding-bottom:10px;">
    📊 Weekly Performance Digest
  </h1>
  <p style="color:#666;">Report for <strong>${this.escapeHtml(orgName)}</strong></p>

  <!-- Trend Summary -->
  <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:20px 0;">
    <h2 style="margin:0 0 8px 0;font-size:18px;">${trendEmoji} Week-over-Week Trend</h2>
    <p style="margin:0;font-size:24px;font-weight:bold;color:${trend.direction === 'up' ? '#28a745' : trend.direction === 'down' ? '#dc3545' : '#6c757d'};">
      ${trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}${trendPct}%
    </p>
    <p style="margin:4px 0 0;color:#666;font-size:14px;">
      Engagement: ${this.formatNumber(trend.currentEngagement)} (prev: ${this.formatNumber(trend.previousEngagement)})
    </p>
  </div>

  <!-- Top Performers -->
  <h2 style="color:#1a1a2e;font-size:18px;">🏆 Top Performers</h2>
  ${
    summary.topPerformers.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#f8f9fa;">
        <th style="padding:8px;text-align:left;">#</th>
        <th style="padding:8px;text-align:left;">Content</th>
        <th style="padding:8px;text-align:left;">Platform</th>
        <th style="padding:8px;text-align:left;">Engagement</th>
        <th style="padding:8px;text-align:left;">Views</th>
      </tr>
    </thead>
    <tbody>${topPerformersHtml}</tbody>
  </table>`
      : '<p style="color:#999;">No performance data this week.</p>'
  }

  <!-- Platform Breakdown -->
  <h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;">📱 Platform Breakdown</h2>
  ${
    summary.avgEngagementByPlatform.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#f8f9fa;">
        <th style="padding:8px;text-align:left;">Platform</th>
        <th style="padding:8px;text-align:left;">Avg Engagement</th>
        <th style="padding:8px;text-align:left;">Posts</th>
      </tr>
    </thead>
    <tbody>${platformHtml}</tbody>
  </table>`
      : '<p style="color:#999;">No platform data available.</p>'
  }

  <!-- Best Posting Times -->
  <h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;">⏰ Best Posting Times</h2>
  ${bestTimesHtml ? `<ul style="font-size:14px;">${bestTimesHtml}</ul>` : '<p style="color:#999;">Not enough data yet.</p>'}

  <!-- Top Hooks -->
  ${
    summary.topHooks.length > 0
      ? `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;">🎣 Top Hooks</h2>
  <ol style="font-size:14px;">
    ${summary.topHooks.map((h) => `<li>"${this.escapeHtml(h.substring(0, 80))}"</li>`).join('')}
  </ol>`
      : ''
  }

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:12px;">
    This is an automated performance digest from GenFeed AI.
    To unsubscribe, update your notification preferences in the dashboard.
  </p>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  }
}
