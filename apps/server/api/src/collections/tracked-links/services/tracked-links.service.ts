import { isIP } from 'node:net';
import process from 'node:process';
import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';
import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';
import type { LinkClickDocument } from '@api/collections/tracked-links/schemas/link-click.schema';
import type { TrackedLinkDocument } from '@api/collections/tracked-links/schemas/tracked-link.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';

/** Fields a caller is allowed to mutate on an existing tracked link. */
type TrackedLinkUpdatePayload = {
  isActive?: boolean;
  originalUrl?: string;
  title?: string;
};

type TrackedLink = TrackedLinkDocument;
type CountryCacheEntry = { country?: string; expiresAt: number };
type ClickRateEntry = { count: number; resetAt: number };

const CLICK_RATE_LIMIT = 120;
const CLICK_RATE_WINDOW_MS = 60_000;

@Injectable()
export class TrackedLinksService {
  private readonly clickRateLimiter = new Map<string, ClickRateEntry>();
  private readonly countryCache = new Map<string, CountryCacheEntry>();
  private readonly logger = new Logger(TrackedLinksService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async assertBrandAccess(
    brandId: string | undefined,
    organizationId: string,
  ): Promise<string | undefined> {
    if (!brandId) return undefined;

    const brand = await this.prisma.brand.findFirst({
      where: {
        OR: [{ id: brandId }, { mongoId: brandId }],
        isDeleted: false,
        organizationId,
      },
    });

    if (!brand) {
      throw new NotFoundException(`Brand not found: ${brandId}`);
    }

    return brand.id;
  }

  private async assertContentAccess(
    contentId: string | undefined,
    organizationId: string,
    brandId: string | undefined,
  ): Promise<string | undefined> {
    if (!contentId) return undefined;

    const content = await this.prisma.ingredient.findFirst({
      where: {
        OR: [{ id: contentId }, { mongoId: contentId }],
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    });

    if (!content) {
      throw new NotFoundException(`Content not found: ${contentId}`);
    }

    return content.id;
  }

  /**
   * Generate tracking link with UTM parameters
   */
  async generateTrackingLink(
    dto: CreateTrackedLinkDto,
    organizationId: string,
  ): Promise<TrackedLink> {
    const brandId = await this.assertBrandAccess(dto.brandId, organizationId);
    const contentId = await this.assertContentAccess(
      dto.contentId,
      organizationId,
      brandId,
    );

    // Generate unique short code
    let shortCode = dto.customSlug || nanoid(8);

    // CRITICAL: Ensure uniqueness GLOBALLY (not just within organization)
    // Short links are resolved without organization context during redirects,
    // so collisions across organizations would cause cross-contamination
    let attempts = 0;
    while (attempts < 5) {
      const existing = await this.prisma.trackedLink.findFirst({
        where: { isDeleted: false, shortCode },
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
    const trackedLink = await this.prisma.trackedLink.create({
      data: {
        brandId,
        campaignName: dto.campaignName,
        contentId,
        contentType: dto.contentType,
        customSlug: dto.customSlug,
        isActive: true,
        isDeleted: false,
        organizationId,
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
      } as never,
    });

    this.logger.log(`Tracking link generated: ${shortUrl}`, {
      linkId: trackedLink.id,
      organizationId,
    });

    return trackedLink as unknown as TrackedLink;
  }

  /**
   * Build URL with UTM parameters
   */
  private buildUTMUrl(
    url: string,
    utm: Record<string, string | undefined>,
  ): string {
    const urlObj = this.parseRedirectUrl(url);

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
  }

  private parseRedirectUrl(url: string): URL {
    let urlObj: URL;

    try {
      urlObj = new URL(url);
    } catch {
      throw new BadRequestException('Tracked link URL must be absolute');
    }

    if (urlObj.protocol !== 'https:') {
      throw new BadRequestException('Tracked link URL must use HTTPS');
    }

    if (this.isBlockedRedirectHost(urlObj.hostname)) {
      throw new BadRequestException('Tracked link URL host is not allowed');
    }

    return urlObj;
  }

  private isBlockedRedirectHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    ) {
      return true;
    }

    if (isIP(host) === 4) {
      const [a = 0, b = 0] = host.split('.').map((part) => Number(part));
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a === 169 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }

    if (isIP(host) === 6) {
      return host === '::1' || host.startsWith('fc') || host.startsWith('fd');
    }

    return false;
  }

  /**
   * Get tracked link by ID
   */
  async getById(linkId: string, organizationId: string): Promise<TrackedLink> {
    const link = await this.prisma.trackedLink.findFirst({
      where: { id: linkId, isDeleted: false, organizationId },
    });

    if (!link) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    return link as unknown as TrackedLink;
  }

  /**
   * Get tracked link by short code (for redirect)
   */
  async getByShortCode(shortCode: string): Promise<TrackedLink | null> {
    const result = await this.prisma.trackedLink.findFirst({
      where: { isActive: true, isDeleted: false, shortCode },
    });
    if (!result) {
      return null;
    }
    return { ...result, _id: result.id } as unknown as TrackedLink;
  }

  /**
   * Get all links for content
   */
  async getContentLinks(
    contentId: string,
    organizationId: string,
  ): Promise<TrackedLink[]> {
    const results = await this.prisma.trackedLink.findMany({
      orderBy: { createdAt: 'desc' },
      where: { contentId, isDeleted: false, organizationId },
    });
    return results as unknown as TrackedLink[];
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
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (filters?.platform) {
      where.platform = filters.platform;
    }
    if (filters?.campaignName) {
      where.campaignName = filters.campaignName;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const results = await this.prisma.trackedLink.findMany({
      orderBy: { createdAt: 'desc' },
      where: where as never,
    });
    return results as unknown as TrackedLink[];
  }

  /**
   * Track click
   */
  async trackClick(
    dto: TrackClickDto,
    req?: { ip?: string; headers?: Record<string, string | undefined> },
  ): Promise<void> {
    const link = await this.prisma.trackedLink.findFirst({
      where: { id: dto.linkId, isActive: true, isDeleted: false },
    });

    if (!link) {
      this.logger.warn(`Link not found for click tracking: ${dto.linkId}`);
      return;
    }

    this.assertClickRateLimit(dto.linkId, req?.ip);

    // Get device type
    const device = this.getDeviceType(
      dto.userAgent || req?.headers?.['user-agent'],
    );

    // Get country from IP
    const country = await this.getCountryFromIP(req?.ip);

    let isUnique = false;
    const sessionId = dto.sessionId || `anon:${nanoid()}`;

    await this.prisma.$transaction(
      async (tx) => {
        isUnique = dto.sessionId
          ? !(await tx.linkClick.findFirst({
              where: { linkId: dto.linkId, sessionId },
            }))
          : false;

        await tx.linkClick.create({
          data: {
            country,
            device,
            gaClientId: dto.gaClientId,
            isUnique,
            linkId: dto.linkId,
            referrer: dto.referrer || req?.headers?.referer,
            sessionId,
            timestamp: new Date(),
            userAgent: dto.userAgent || req?.headers?.['user-agent'],
          } as never,
        });

        await this.refreshLinkStats(tx, dto.linkId);
      },
      { isolationLevel: 'Serializable' },
    );

    this.logger.log(`Click tracked for link ${dto.linkId}`, {
      country,
      device,
      isUnique,
    });
  }

  private assertClickRateLimit(linkId: string, ip?: string): void {
    const key = `${linkId}:${ip?.split(',')[0]?.trim() || 'unknown'}`;
    const now = Date.now();

    for (const [entryKey, value] of this.clickRateLimiter) {
      if (now >= value.resetAt) {
        this.clickRateLimiter.delete(entryKey);
      }
    }

    const entry = this.clickRateLimiter.get(key);

    if (!entry || now >= entry.resetAt) {
      this.clickRateLimiter.set(key, {
        count: 1,
        resetAt: now + CLICK_RATE_WINDOW_MS,
      });
      return;
    }

    if (entry.count >= CLICK_RATE_LIMIT) {
      throw new HttpException(
        'Too many click tracking requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
  }

  private async refreshLinkStats(
    tx: Pick<PrismaService, 'linkClick' | 'trackedLink'>,
    linkId: string,
  ): Promise<void> {
    const clicks = await tx.linkClick.findMany({
      select: { sessionId: true },
      where: { linkId },
    });
    const uniqueClicks = new Set(
      clicks
        .map((click) => click.sessionId)
        .filter((sessionId) => sessionId && !sessionId.startsWith('anon:')),
    ).size;

    await tx.trackedLink.update({
      data: {
        stats: {
          lastClickAt: new Date(),
          totalClicks: clicks.length,
          uniqueClicks,
        },
      } as never,
      where: { id: linkId },
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
    const clicks = await this.prisma.linkClick.findMany({
      where: { linkId },
    });

    const clickDocs = clicks as unknown as Array<{
      timestamp: Date;
      country?: string;
      device?: string;
      referrer?: string;
    }>;

    const clicksByDate: Record<string, number> = {};
    const clicksByCountry: Record<string, number> = {};
    const clicksByDevice: Record<string, number> = {};
    const clicksByReferrer: Record<string, number> = {};

    clickDocs.forEach((click) => {
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

    const linkDoc = link as unknown as Record<string, unknown> & {
      stats: { totalClicks: number; uniqueClicks: number; lastClickAt?: Date };
      createdAt: Date;
    };

    return {
      clicksByCountry,
      clicksByDate,
      clicksByDevice,
      clicksByReferrer,
      contentId: (linkDoc.contentId as string) ?? undefined,
      contentType: linkDoc.contentType as string | undefined,
      createdAt: linkDoc.createdAt,
      lastClickAt: linkDoc.stats?.lastClickAt,
      linkId: String(linkDoc.id ?? linkDoc._id),
      platform: linkDoc.platform as string | undefined,
      shortUrl: linkDoc.shortUrl as string,
      totalClicks: linkDoc.stats?.totalClicks ?? 0,
      uniqueClicks: linkDoc.stats?.uniqueClicks ?? 0,
      url: linkDoc.originalUrl as string,
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

    const linkDocs = links as unknown as Array<{
      id: string;
      contentType?: string;
      shortUrl: string;
      stats: { totalClicks: number; uniqueClicks: number };
    }>;

    const totalLinks = linkDocs.length;
    const totalClicks = linkDocs.reduce(
      (sum, link) => sum + link.stats.totalClicks,
      0,
    );
    const uniqueClicks = linkDocs.reduce(
      (sum, link) => sum + link.stats.uniqueClicks,
      0,
    );
    const avgClicksPerLink = totalLinks > 0 ? totalClicks / totalLinks : 0;

    // Find top performing link
    const topLink = linkDocs.reduce(
      (
        best: {
          id: string;
          shortUrl: string;
          stats: { totalClicks: number };
        } | null,
        link,
      ) => {
        return link.stats.totalClicks > (best?.stats.totalClicks || 0)
          ? link
          : best;
      },
      null,
    );

    // Get clicks by date for trend
    const linkIds = linkDocs.map((l) => l.id);
    const clicks = await this.prisma.linkClick.findMany({
      where: { linkId: { in: linkIds } },
    });

    const clickDocs = clicks as unknown as Array<{ timestamp: Date }>;
    const clicksByDate: Record<string, number> = {};
    clickDocs.forEach((click) => {
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
      contentType: linkDocs[0]?.contentType || 'unknown',
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
   * Update tracked link — only whitelisted mutable fields are applied.
   */
  async update(
    linkId: string,
    organizationId: string,
    updates: TrackedLinkUpdatePayload,
  ): Promise<TrackedLink> {
    const existing = await this.prisma.trackedLink.findFirst({
      where: { id: linkId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    // Allowlist: only safe, user-editable fields are forwarded to the DB.
    // shortCode, organizationId, stats, etc. must never be mutated via this path.
    const safeData: TrackedLinkUpdatePayload = {};
    if (updates.isActive !== undefined) safeData.isActive = updates.isActive;
    if (updates.originalUrl !== undefined)
      safeData.originalUrl = this.parseRedirectUrl(
        updates.originalUrl,
      ).toString();
    if (updates.title !== undefined) safeData.title = updates.title;

    const result = await this.prisma.trackedLink.update({
      data: safeData as never,
      where: { id: linkId },
    });

    this.logger.log(`Tracked link updated: ${linkId}`);
    return result as unknown as TrackedLink;
  }

  /**
   * Delete tracked link (soft delete)
   */
  async delete(linkId: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.trackedLink.findFirst({
      where: { id: linkId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Tracked link not found: ${linkId}`);
    }

    await this.prisma.trackedLink.update({
      data: { isDeleted: true } as never,
      where: { id: linkId },
    });

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
    const normalizedIp = ip?.split(',')[0]?.trim();
    if (
      !normalizedIp ||
      normalizedIp === '::1' ||
      normalizedIp === '127.0.0.1' ||
      normalizedIp.startsWith('192.168.') ||
      normalizedIp.startsWith('10.')
    ) {
      return undefined;
    }

    const cached = this.countryCache.get(normalizedIp);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.country;
    }

    try {
      const response = await fetch(
        `https://ipapi.co/${normalizedIp}/country/`,
        {
          signal: AbortSignal.timeout(1000), // 1 second timeout
        },
      );

      if (response.ok) {
        const country = await response.text();
        const trimmedCountry = country.trim() || undefined;
        this.countryCache.set(normalizedIp, {
          country: trimmedCountry,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        return trimmedCountry;
      }
    } catch (error: unknown) {
      this.logger.warn(`IP geolocation failed for ${normalizedIp}`, error);
    }

    this.countryCache.set(normalizedIp, {
      country: undefined,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
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
