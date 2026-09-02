import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerNotifications,
  type ServerPrisma,
} from '@api/server.dependencies';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  PerformanceSummaryService,
  type WeeklySummary,
} from './performance-summary.service';

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

export interface EmailDigestPrepared {
  options: EmailDigestOptions;
  organizationName: string;
  summary: WeeklySummary;
}

export interface EmailDigestRendered {
  deliveries: Array<{ email: string; html: string; subject: string }>;
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

  async prepareDigest(
    options: EmailDigestOptions,
  ): Promise<EmailDigestPrepared> {
    const summary = await this.performanceSummaryService.getWeeklySummary(
      options.organizationId,
      options.brandId,
      {
        endDate: options.endDate as string,
        startDate: options.startDate as string,
      },
    );
    const organization = await this.prisma.organization.findUnique({
      where: { id: options.organizationId },
    });
    return {
      options,
      organizationName: organization?.label ?? 'Your Organization',
      summary,
    };
  }

  async discoverDigestRecipients(
    prepared: EmailDigestPrepared,
  ): Promise<EmailDigestPrepared & { recipients: string[] }> {
    return {
      ...prepared,
      recipients: await this.resolveRecipients(
        prepared.options.organizationId,
        prepared.options.recipientEmails,
      ),
    };
  }

  renderDigest(
    state: EmailDigestPrepared & { recipients: string[] },
  ): EmailDigestRendered {
    const html = this.buildDigestHtml(state.summary, state.organizationName);
    const subject = `Weekly Performance Digest - ${state.organizationName}`;
    return {
      deliveries: state.recipients.map((email) => ({ email, html, subject })),
    };
  }

  async deliverDigestRecipient(input: {
    email: string;
    html: string;
    subject: string;
  }): Promise<{ email: string; sent: boolean; error?: string }> {
    try {
      await this.notificationsService.sendEmail(
        input.email,
        input.subject,
        input.html,
      );
      return { email: input.email, sent: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send digest email to ${input.email}`, error);
      return { email: input.email, error: message, sent: false };
    }
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
