import { createHash } from 'node:crypto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MAX_MEDIA_VIEW_BATCH } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** One view per visitor per page per day. */
const VIEW_WINDOW_SECONDS = 24 * 60 * 60;
const BOT_USER_AGENT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const PUBLIC_SCOPE = CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC);

/** The public things that keep a count, and the media Recreate clicks. */
export type PublicViewTarget = 'article' | 'media' | 'profile' | 'recreate';

export interface PublicVisitor {
  ip: string;
  userAgent: string;
}

/** Public, finished images and videos: the only media a gallery shows. */
function publicMediaWhere(ids: readonly string[]): Prisma.IngredientWhereInput {
  return {
    category: {
      in: [
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.IMAGE),
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO),
      ],
    },
    id: { in: [...ids] },
    isDeleted: false,
    scope: PUBLIC_SCOPE,
    status: CategoryPrismaUtil.toIngredientStatus(IngredientStatus.GENERATED),
  };
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
 * Counts views of public creator pages (a profile, an article), of public
 * images and videos in the community gallery, and clicks on Recreate in
 * Genfeed. A visitor counts once a day per item: the first view claims a key
 * built from a hash of their address and browser, and later views inside the
 * window find it taken. When the claim store is down nothing is counted, so the number never
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
      where: { id: brandId, isDeleted: false, scope: PUBLIC_SCOPE },
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

  /**
   * Records views of public images and videos shown in a gallery, and returns
   * the count of each one that is public. An id that is not a public,
   * finished image or video is left out.
   */
  async recordMediaViews(
    ingredientIds: readonly string[],
    visitor: PublicVisitor,
    now: Date = new Date(),
  ): Promise<Record<string, number>> {
    const ids = [...new Set(ingredientIds)].slice(0, MAX_MEDIA_VIEW_BATCH);
    if (ids.length === 0) {
      return {};
    }
    // tenant-scope-ignore: public gallery read; only live, public, finished media is counted, and the writes below are org-scoped.
    const media = await this.prisma.ingredient.findMany({
      select: { id: true, organizationId: true, viewCount: true },
      where: publicMediaWhere(ids),
    });
    const claims = await Promise.all(
      media.map(async (item) => ({
        ...item,
        isClaimed:
          item.organizationId !== null &&
          (await this.claim('media', item.id, visitor, now)),
      })),
    );

    const claimedByOrganization = new Map<string, string[]>();
    for (const item of claims) {
      if (item.isClaimed && item.organizationId) {
        const claimed = claimedByOrganization.get(item.organizationId) ?? [];
        claimed.push(item.id);
        claimedByOrganization.set(item.organizationId, claimed);
      }
    }
    await Promise.all(
      [...claimedByOrganization].map(([organizationId, claimedIds]) =>
        this.prisma.ingredient.updateMany({
          data: { viewCount: { increment: 1 } },
          where: scopedWhere(organizationId, { id: { in: claimedIds } }),
        }),
      ),
    );

    return Object.fromEntries(
      claims.map((item) => [
        item.id,
        item.viewCount + (item.isClaimed ? 1 : 0),
      ]),
    );
  }

  /**
   * Records a click on Recreate in Genfeed under a public image or video and
   * returns its count, or null when the item is not public.
   */
  async recordRecreation(
    ingredientId: string,
    visitor: PublicVisitor,
    now: Date = new Date(),
  ): Promise<number | null> {
    // tenant-scope-ignore: public gallery read; only live, public, finished media is counted, and the write below is org-scoped.
    const item = await this.prisma.ingredient.findFirst({
      select: { organizationId: true, recreateCount: true },
      where: publicMediaWhere([ingredientId]),
    });
    if (!item?.organizationId) {
      return null;
    }
    if (!(await this.claim('recreate', ingredientId, visitor, now))) {
      return item.recreateCount;
    }

    await this.prisma.ingredient.updateMany({
      data: { recreateCount: { increment: 1 } },
      where: scopedWhere(item.organizationId, { id: ingredientId }),
    });
    return item.recreateCount + 1;
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
