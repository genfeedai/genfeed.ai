import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { PUBLIC_BRAND_WHERE } from '@api/helpers/utils/public-brand/public-brand-filter.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AssetScope } from '@genfeedai/prisma';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const LEADING_AT_PATTERN = /^@/;

/** The signed-in reader paying a creator, and the organization they pay from. */
export type CreatorPaymentReader = {
  organizationId: string;
  userId: string;
};

/** A public creator: a PUBLIC brand, addressed by its handle. */
export type PublicCreator = {
  id: string;
  label: string;
  organizationId: string;
  slug: string;
};

/** A published article of a public creator, with its full body. */
export type PublicCreatorArticle = {
  accessLevel: string;
  content: string | null;
  creator: PublicCreator;
  id: string;
  label: string;
  slug: string | null;
  unlockPriceCredits: number | null;
};

/**
 * Finds public creators for readers in other organizations (#9714). Every
 * read of the creator's data runs inside the creator organization's tenant
 * context; only the owning organization's id is looked up outside it.
 */
@Traced()
@Injectable()
export class CreatorDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A public profile belongs to another organization. Its handle is globally
   * unique, so the owning organization is found first (only its id is read),
   * then the brand is read inside that organization's tenant context. Only
   * PUBLIC, live brands of live organizations are reachable.
   */
  async findPublicCreator(handle: string): Promise<PublicCreator> {
    const slug = handle.trim().replace(LEADING_AT_PATTERN, '');
    const publicBrand = {
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      slug: { equals: slug, mode: 'insensitive' as const },
    };
    const owner = slug
      ? await this.prisma.organization.findFirst({
          select: { id: true },
          where: { brands: { some: publicBrand }, isDeleted: false },
        })
      : null;
    const creator = owner
      ? await runWithTenantContext(
          { organizationId: owner.id },
          // Prisma queries run when awaited: await inside the context.
          async () =>
            await this.prisma.brand.findFirst({
              select: {
                id: true,
                label: true,
                organizationId: true,
                slug: true,
              },
              where: scopedWhere(owner.id, publicBrand),
            }),
        )
      : null;
    if (!creator) {
      throw new NotFoundException('Creator');
    }
    return creator;
  }

  /**
   * A published article of a public brand, read the same way: only the owning
   * organization's id is looked up across tenants, then the article and its
   * brand are read inside that organization's context.
   */
  async findPublicArticle(
    articleId: string,
    now: Date = new Date(),
  ): Promise<PublicCreatorArticle> {
    const publicArticle = {
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(now),
      brand: { is: PUBLIC_BRAND_WHERE },
      id: articleId,
      isDeleted: false,
    };
    const owner = articleId
      ? await this.prisma.organization.findFirst({
          select: { id: true },
          where: { articles: { some: publicArticle }, isDeleted: false },
        })
      : null;
    const article = owner
      ? await runWithTenantContext(
          { organizationId: owner.id },
          async () =>
            await this.prisma.article.findFirst({
              select: {
                accessLevel: true,
                brand: {
                  select: {
                    id: true,
                    label: true,
                    organizationId: true,
                    slug: true,
                  },
                },
                content: true,
                id: true,
                label: true,
                slug: true,
                unlockPriceCredits: true,
              },
              where: scopedWhere(owner.id, publicArticle),
            }),
        )
      : null;
    if (!article?.brand?.slug) {
      throw new NotFoundException('Article');
    }
    const { brand, ...rest } = article;
    return {
      ...rest,
      creator: {
        id: brand.id,
        label: brand.label,
        organizationId: brand.organizationId,
        slug: brand.slug,
      },
    };
  }

  /** Readers cannot pay a creator whose workspace they belong to. */
  async isReaderOnCreatorTeam(
    reader: CreatorPaymentReader,
    creator: PublicCreator,
  ): Promise<boolean> {
    if (reader.organizationId === creator.organizationId) {
      return true;
    }
    const membership = await runWithTenantContext(
      { organizationId: creator.organizationId },
      async () =>
        await this.prisma.member.findFirst({
          select: { id: true },
          where: scopedWhere(creator.organizationId, {
            userId: reader.userId,
          }),
        }),
    );
    return Boolean(membership);
  }

  /** How the reader is named on the creator's side of the ledger. */
  async readerName(reader: CreatorPaymentReader): Promise<string> {
    const user = await this.prisma.user.findFirst({
      select: { firstName: true, handle: true, name: true },
      where: { id: reader.userId, isDeleted: false },
    });
    return (
      user?.name?.trim() ||
      user?.firstName?.trim() ||
      user?.handle ||
      'a reader'
    );
  }
}
