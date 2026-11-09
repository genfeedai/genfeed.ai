import { createHash } from 'node:crypto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetScope } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** One view per visitor per profile per day. */
const VIEW_WINDOW_SECONDS = 24 * 60 * 60;
const BOT_USER_AGENT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const PUBLIC_BRAND_SCOPE = CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC);

export interface ProfileVisitor {
  ip: string;
  userAgent: string;
}

/** A visitor key that never stores the address or the browser string. */
export function profileVisitorKey(
  brandId: string,
  visitor: ProfileVisitor,
  day: string,
): string {
  const digest = createHash('sha256')
    .update(`${brandId}|${visitor.ip}|${visitor.userAgent}|${day}`)
    .digest('hex');
  return `public:profile-view:${brandId}:${digest}`;
}

/** Crawlers and link previews open profiles too; they are not visitors. */
export function isCountableVisitor(visitor: ProfileVisitor): boolean {
  return (
    visitor.ip.length > 0 &&
    visitor.userAgent.length > 0 &&
    !BOT_USER_AGENT_PATTERN.test(visitor.userAgent)
  );
}

/**
 * Counts views of a public creator profile. A visitor counts once a day:
 * the first view claims a key built from a hash of their address and browser,
 * and later views inside the window find it taken. When the claim store is
 * down nothing is counted, so the number never runs ahead of real visits.
 */
@Traced()
@Injectable()
export class PublicProfileViewsService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  /** Records the view and returns the profile's view count, or null when the profile is not public. */
  async record(
    brandId: string,
    visitor: ProfileVisitor,
    now: Date = new Date(),
  ): Promise<number | null> {
    // tenant-scope-ignore: public profile read; only a live public brand is counted, and the write below is org-scoped.
    const brand = await this.prisma.brand.findFirst({
      select: { organizationId: true, profileViewCount: true },
      where: { id: brandId, isDeleted: false, scope: PUBLIC_BRAND_SCOPE },
    });
    if (!brand) {
      return null;
    }
    if (!isCountableVisitor(visitor)) {
      return brand.profileViewCount;
    }

    const day = now.toISOString().slice(0, 10);
    const claim = await this.cacheService.claimOnce(
      profileVisitorKey(brandId, visitor, day),
      VIEW_WINDOW_SECONDS,
    );
    if (claim !== 'claimed') {
      return brand.profileViewCount;
    }

    await this.prisma.brand.updateMany({
      data: { profileViewCount: { increment: 1 } },
      where: scopedWhere(brand.organizationId, { id: brandId }),
    });
    return brand.profileViewCount + 1;
  }
}
