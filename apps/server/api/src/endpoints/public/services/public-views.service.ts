import { createHash } from 'node:crypto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetScope } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** One view per visitor per page per day. */
const VIEW_WINDOW_SECONDS = 24 * 60 * 60;
const BOT_USER_AGENT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const PUBLIC_BRAND_SCOPE = CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC);

/** The public pages that keep a view count. */
export type PublicViewTarget = 'article' | 'profile';

export interface PublicVisitor {
  ip: string;
  userAgent: string;
}

/** A visitor key that never stores the address or the browser string. */
export function publicVisitorKey(
  target: PublicViewTarget,
  id: string,
  visitor: PublicVisitor,
  day: string,
): string {
  const digest = createHash('sha256')
    .update(`${id}|${visitor.ip}|${visitor.userAgent}|${day}`)
    .digest('hex');
  return `public:${target}-view:${id}:${digest}`;
}

/** Crawlers and link previews open pages too; they are not visitors. */
export function isCountableVisitor(visitor: PublicVisitor): boolean {
  return (
    visitor.ip.length > 0 &&
    visitor.userAgent.length > 0 &&
    !BOT_USER_AGENT_PATTERN.test(visitor.userAgent)
  );
}

/**
 * Counts views of public creator pages: a profile and an article. A visitor
 * counts once a day per page: the first view claims a key built from a hash
 * of their address and browser, and later views inside the window find it
 * taken. When the claim store is down nothing is counted, so the number never
 * runs ahead of real visits.
 */
@Traced()
@Injectable()
export class PublicViewsService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  /** Records a profile view and returns its count, or null when the profile is not public. */
  async recordProfile(
    brandId: string,
    visitor: PublicVisitor,
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
    if (!(await this.claim('profile', brandId, visitor, now))) {
      return brand.profileViewCount;
    }

    await this.prisma.brand.updateMany({
      data: { profileViewCount: { increment: 1 } },
      where: scopedWhere(brand.organizationId, { id: brandId }),
    });
    return brand.profileViewCount + 1;
  }

  /**
   * Records an article view and returns its count, or null when the article
   * is not public. `publicWhere` is the public article scope, so a draft or an
   * article outside it is never counted.
   */
  async recordArticle(
    articleId: string,
    publicWhere: Prisma.ArticleWhereInput,
    visitor: PublicVisitor,
    now: Date = new Date(),
  ): Promise<number | null> {
    // tenant-scope-ignore: public article read; publicWhere pins published, live articles, and the write below is org-scoped.
    const article = await this.prisma.article.findFirst({
      select: { organizationId: true, viewCount: true },
      where: { ...publicWhere, id: articleId, isDeleted: false },
    });
    if (!article) {
      return null;
    }
    if (!(await this.claim('article', articleId, visitor, now))) {
      return article.viewCount;
    }

    await this.prisma.article.updateMany({
      data: { viewCount: { increment: 1 } },
      where: scopedWhere(article.organizationId, { id: articleId }),
    });
    return article.viewCount + 1;
  }

  private async claim(
    target: PublicViewTarget,
    id: string,
    visitor: PublicVisitor,
    now: Date,
  ): Promise<boolean> {
    if (!isCountableVisitor(visitor)) {
      return false;
    }
    const day = now.toISOString().slice(0, 10);
    const claim = await this.cacheService.claimOnce(
      publicVisitorKey(target, id, visitor, day),
      VIEW_WINDOW_SECONDS,
    );
    return claim === 'claimed';
  }
}
