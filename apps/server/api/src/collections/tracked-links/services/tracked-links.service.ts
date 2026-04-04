import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';
import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';
import {
  LinkClick,
  type LinkClickDocument,
} from '@api/collections/tracked-links/schemas/link-click.schema';
import {
  TrackedLink,
  type TrackedLinkDocument,
} from '@api/collections/tracked-links/schemas/tracked-link.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { nanoid } from 'nanoid';

@Injectable()
export class TrackedLinksService {
  private readonly logger = new Logger(TrackedLinksService.name);

  constructor(
    @InjectModel(TrackedLink.name, DB_CONNECTIONS.CLOUD)
    private trackedLinkModel: Model<TrackedLinkDocument>,
    @InjectModel(LinkClick.name, DB_CONNECTIONS.CLOUD)
    private linkClickModel: Model<LinkClickDocument>,
  ) {}

  /**
   * Generate tracking link with UTM parameters
   */
  async generateTrackingLink(
    dto: CreateTrackedLinkDto,
    organizationId: string,
  ): Promise<TrackedLink> {
    // Generate unique short code
    let shortCode = dto.customSlug || nanoid(8);

    // CRITICAL: Ensure uniqueness GLOBALLY (not just within organization)
    // Short links are resolved without organization context during redirects,
    // so collisions across organizations would cause cross-contamination
    let attempts = 0;
    while (attempts < 5) {
      const existing = await this.trackedLinkModel.findOne({
        isDeleted: false,
        shortCode,
      });

      if (!existing) {
        break;
      }

      // If custom slug is taken, reject immediately
      if (dto.customSlug) {
        throw new Error(
          `Custom slug "${dto.customSlug}" is already in use. Please choose a different slug.`,
        );
      }

      shortCode = nanoid(8);
      attempts++;
    }

    if (attempts >= 5) {
      throw new Error('Failed to generate unique short code');
    }

    // Build UTM URL
    const utmUrl = this.buildUTMUrl(dto.url, {
      campaign: dto.campaignName || dto.utm?.campaign,
      content: dto.contentId || dto.utm?.content,
      medium: dto.utm?.medium || 'social',
      source: dto.platform || dto.utm?.source || 'genfeed',
      term: dto.utm?.term,
    });

    // Generate short URL
    const baseUrl = process.env.SHORT_LINK_BASE_URL || 'https://genfeed.ai/l';
    const shortUrl = `${baseUrl}/${shortCode}`;

    // Create tracked link
    const trackedLink = await this.trackedLinkModel.create({
      brand: dto.brandId,
      campaignName: dto.campaignName,
      content: dto.contentId,
      contentType: dto.contentType,
      customSlug: dto.customSlug,
      isActive: true,
      isDeleted: false,
      organization: organizationId,
      originalUrl: utmUrl,
      platform: dto.platform,
      shortCode,
      shortUrl,
      stats: {
        totalClicks: 0,
        uniqueClicks: 0,
      },
      utm: {
        campaign: dto.campaignName || dto.utm?.campaign,
        content: dto.contentId || dto.utm?.content,
        medium: dto.utm?.medium || 'social',
        source: dto.platform || dto.utm?.source || 'genfeed',
        term: dto.utm?.term,
      },
    });

    this.logger.log(`Tracking link generated: ${shortUrl}`, {
      linkId: trackedLink._id,
      organizationId,
    });

    return trackedLink;
  }

  /**
   * Build URL with UTM parameters
   */
  private buildUTMUrl(
    url: string,
    utm: Record<string, string | undefined>,
  ): string {
    try {
      const urlObj = new URL(url);

      if (utm.source) {
        urlObj.searchParams.set('utm_source', utm.source);
      }
      if (utm.medium) {
        urlObj.searchParams.set('utm_medium', utm.medium);
      }
      if (utm.campaign) {
        urlObj.searchParams.set('utm_campaign', utm.campaign);
      }
      if (utm.content) {
        urlObj.searchParams.set('utm_content', utm.content);
      }
      if (utm.term) {
        urlObj.searchParams.set('utm_term', utm.term);
      }

      return urlObj.toString();
    } catch (error: unknown) {
      // If URL parsing fails, return original
      this.logger.warn(`Failed to parse URL: ${url}`, error);
      return url;
    }
  }

  /**
   * Get tracked link by ID
   */
  async getById(linkId: string, organizationId: string): Promise<TrackedLink> {
    const link = await this.trackedLinkModel.findOne({
      _id: linkId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!link) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    return link;
  }

  /**
   * Get tracked link by short code (for redirect)
   */
  async getByShortCode(shortCode: string): Promise<TrackedLink | null> {
    return await this.trackedLinkModel.findOne({
      isActive: true,
      isDeleted: false,
      shortCode,
    });
  }

  /**
   * Get all links for content
   */
  async getContentLinks(
    contentId: string,
    organizationId: string,
  ): Promise<TrackedLink[]> {
    return await this.trackedLinkModel
      .find({
        content: contentId,
        isDeleted: false,
        organization: organizationId,
      })
      .sort({ createdAt: -1 });
  }

  /**
   * Get all links for organization
   */
  async getOrganizationLinks(
    organizationId: string,
    filters?: {
      platform?: string;
      campaignName?: string;
      isActive?: boolean;
    },
  ): Promise<TrackedLink[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (filters?.platform) {
      query.platform = filters.platform;
    }
    if (filters?.campaignName) {
      query.campaignName = filters.campaignName;
    }
    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    return await this.trackedLinkModel.find(query).sort({ createdAt: -1 });
  }

  /**
   * Track click
   */
  async trackClick(
    dto: TrackClickDto,
    req?: { ip?: string; headers?: Record<string, string | undefined> },
  ): Promise<void> {
    const link = await this.trackedLinkModel.findById(dto.linkId);

    if (!link) {
      this.logger.warn(`Link not found for click tracking: ${dto.linkId}`);
      return;
    }

    // Check if unique (first click from this session)
    const isUnique = dto.sessionId
      ? !(await this.linkClickModel.exists({
          linkId: dto.linkId,
          sessionId: dto.sessionId,
        }))
      : false;

    // Get device type
    const device = this.getDeviceType(
      dto.userAgent || req?.headers?.['user-agent'],
    );

    // Get country from IP
    const country = await this.getCountryFromIP(dto.ip || req?.ip);

    // Save click
    await this.linkClickModel.create({
      country,
      device,
      gaClientId: dto.gaClientId,
      isUnique,
      linkId: dto.linkId,
      referrer: dto.referrer || req?.headers?.referer,
      sessionId: dto.sessionId || 'unknown',
      timestamp: new Date(),
      userAgent: dto.userAgent || req?.headers?.['user-agent'],
    });

    // Update link stats
    await this.trackedLinkModel.findByIdAndUpdate(dto.linkId, {
      $inc: {
        'stats.totalClicks': 1,
        'stats.uniqueClicks': isUnique ? 1 : 0,
      },
      'stats.lastClickAt': new Date(),
    });

    this.logger.log(`Click tracked for link ${dto.linkId}`, {
      country,
      device,
      isUnique,
    });
  }

  /**
   * Get link performance
   */
  async getLinkPerformance(
    linkId: string,
    organizationId: string,
  ): Promise<{
    linkId: string;
    url: string;
    shortUrl: string;
    contentId?: string;
    contentType?: string;
    platform?: string;
    totalClicks: number;
    uniqueClicks: number;
    clicksByDate: Record<string, number>;
    clicksByCountry: Record<string, number>;
    clicksByDevice: Record<string, number>;
    clicksByReferrer: Record<string, number>;
    createdAt: Date;
    lastClickAt?: Date;
  }> {
    const link = await this.getById(linkId, organizationId);

    // Get all clicks for this link
    const clicks = await this.linkClickModel.find({ linkId }).lean();

    const clicksByDate: Record<string, number> = {};
    const clicksByCountry: Record<string, number> = {};
    const clicksByDevice: Record<string, number> = {};
    const clicksByReferrer: Record<string, number> = {};

    clicks.forEach((click) => {
      // By date
      const date = click.timestamp.toISOString().split('T')[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;

      // By country
      if (click.country) {
        clicksByCountry[click.country] =
          (clicksByCountry[click.country] || 0) + 1;
      }

      // By device
      if (click.device) {
        clicksByDevice[click.device] = (clicksByDevice[click.device] || 0) + 1;
      }

      // By referrer
      if (click.referrer) {
        const domain = this.extractDomain(click.referrer);
        if (domain) {
          clicksByReferrer[domain] = (clicksByReferrer[domain] || 0) + 1;
        }
      }
    });

    return {
      clicksByCountry,
      clicksByDate,
      clicksByDevice,
      clicksByReferrer,
      contentId: link.content?.toString(),
      contentType: link.contentType,
      // @ts-expect-error TS2339
      createdAt: link.createdAt,
      lastClickAt: link.stats.lastClickAt,
      linkId: link._id.toString(),
      platform: link.platform,
      shortUrl: link.shortUrl,
      totalClicks: link.stats.totalClicks,
      uniqueClicks: link.stats.uniqueClicks,
      url: link.originalUrl,
    };
  }

  /**
   * Get CTA stats for content
   */
  async getContentCTAStats(
    contentId: string,
    organizationId: string,
  ): Promise<{
    contentId: string;
    contentType: string;
    totalLinks: number;
    totalClicks: number;
    uniqueClicks: number;
    avgClicksPerLink: number;
    topLink?: { url: string; clicks: number };
    clickTrend: 'up' | 'down' | 'stable';
    clicksByDate: Record<string, number>;
  }> {
    const links = await this.getContentLinks(contentId, organizationId);

    const totalLinks = links.length;
    const totalClicks = links.reduce(
      (sum, link) => sum + link.stats.totalClicks,
      0,
    );
    const uniqueClicks = links.reduce(
      (sum, link) => sum + link.stats.uniqueClicks,
      0,
    );
    const avgClicksPerLink = totalLinks > 0 ? totalClicks / totalLinks : 0;

    // Find top performing link
    const topLink = links.reduce(
      (best: TrackedLink | null, link: TrackedLink) => {
        return link.stats.totalClicks > (best?.stats.totalClicks || 0)
          ? link
          : best;
      },
      null as TrackedLink | null,
    );

    // Get clicks by date for trend
    const linkIds = links.map((l) => (l as unknown as { _id: unknown })._id);
    const clicks = await this.linkClickModel
      .find({ linkId: { $in: linkIds } })
      .lean();

    const clicksByDate: Record<string, number> = {};
    clicks.forEach((click) => {
      const date = click.timestamp.toISOString().split('T')[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;
    });

    // Calculate trend (last 7 days vs previous 7 days)
    const dates = Object.keys(clicksByDate).sort();
    const recent7 = dates
      .slice(-7)
      .reduce((sum, date) => sum + (clicksByDate[date] || 0), 0);
    const previous7 = dates
      .slice(-14, -7)
      .reduce((sum, date) => sum + (clicksByDate[date] || 0), 0);

    let clickTrend: 'up' | 'down' | 'stable';
    if (recent7 > previous7 * 1.1) {
      clickTrend = 'up';
    } else if (recent7 < previous7 * 0.9) {
      clickTrend = 'down';
    } else {
      clickTrend = 'stable';
    }

    return {
      avgClicksPerLink,
      clicksByDate,
      clickTrend,
      contentId,
      contentType: links[0]?.contentType || 'unknown',
      topLink: topLink
        ? {
            clicks: topLink.stats.totalClicks,
            url: topLink.shortUrl,
          }
        : undefined,
      totalClicks,
      totalLinks,
      uniqueClicks,
    };
  }

  /**
   * Update tracked link
   */
  async update(
    linkId: string,
    organizationId: string,
    updates: Partial<TrackedLink>,
  ): Promise<TrackedLink> {
    const link = await this.trackedLinkModel.findOneAndUpdate(
      { _id: linkId, isDeleted: false, organization: organizationId },
      updates,
      { returnDocument: 'after' },
    );

    if (!link) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    this.logger.log(`Tracked link updated: ${linkId}`);
    return link;
  }

  /**
   * Delete tracked link (soft delete)
   */
  async delete(linkId: string, organizationId: string): Promise<void> {
    const result = await this.trackedLinkModel.updateOne(
      { _id: linkId, organization: organizationId },
      { isDeleted: true },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    this.logger.log(`Tracked link deleted: ${linkId}`);
  }

  /**
   * Get device type from user agent
   */
  private getDeviceType(userAgent?: string): string {
    if (!userAgent) {
      return 'unknown';
    }

    const ua = userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Get country from IP using free geolocation API
   */
  private async getCountryFromIP(ip?: string): Promise<string | undefined> {
    if (
      !ip ||
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')
    ) {
      return undefined;
    }

    try {
      const response = await fetch(`https://ipapi.co/${ip}/country/`, {
        signal: AbortSignal.timeout(1000), // 1 second timeout
      });

      if (response.ok) {
        const country = await response.text();
        return country.trim() || undefined;
      }
    } catch (error: unknown) {
      this.logger.warn(`IP geolocation failed for ${ip}`, error);
    }

    return undefined;
  }

  /**
   * Extract domain from referrer URL
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }
}
