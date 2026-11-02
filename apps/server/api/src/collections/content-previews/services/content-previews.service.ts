import { randomBytes } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import { buildPublicPreviewBrand } from '@api/collections/content-previews/services/content-preview-brand.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  IContentPreview,
  IContentPreviewItemRef,
  IPublicContentPreview,
  IPublicContentPreviewItem,
  IPublicContentPreviewMedia,
  IWarmupPreparation,
} from '@genfeedai/contracts/interfaces';
import {
  AssetCategory,
  type ContentPreview,
  toPrismaJson,
  WarmupAccountStatus,
} from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export const DEFAULT_PREVIEW_LIFETIME_DAYS = 14;
export const MAX_PREVIEW_LIFETIME_DAYS = 90;
export const MAX_PREVIEW_ITEMS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface CreateContentPreviewInput {
  warmupAccountId: string;
  organizationId: string;
  brandId: string;
  createdByUserId: string;
  items: IContentPreviewItemRef[];
  expiresAt: Date;
}

/**
 * Persistence, token handling and the public projection of content previews.
 * The raw token exists only in the mint result; every lookup goes through its
 * SHA-256 hash, and an unknown, expired, revoked or archived preview all
 * resolve to the same 404 so a visitor cannot probe which tokens existed.
 */
@Injectable()
export class ContentPreviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrls: AuthorizedMediaUrlService,
  ) {}

  async create(
    input: CreateContentPreviewInput,
  ): Promise<{ preview: ContentPreview; token: string }> {
    const token = toBase64Url(randomBytes(32));
    const preview = await this.prisma.contentPreview.create({
      data: {
        brandId: input.brandId,
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt,
        items: toPrismaJson(input.items),
        organizationId: input.organizationId,
        tokenHash: hashToken(token),
        warmupAccountId: input.warmupAccountId,
      },
    });
    return { preview, token };
  }

  async revoke(
    organizationId: string,
    warmupAccountId: string,
    previewId: string,
  ): Promise<ContentPreview> {
    const current = await this.getForWarmup(
      organizationId,
      warmupAccountId,
      previewId,
    );
    if (current.revokedAt) return current;
    return this.prisma.contentPreview.update({
      data: { revokedAt: new Date() },
      where: scopedWhere(organizationId, { id: current.id }),
    });
  }

  async extend(
    organizationId: string,
    warmupAccountId: string,
    previewId: string,
    extendByDays: number,
  ): Promise<ContentPreview> {
    const current = await this.getForWarmup(
      organizationId,
      warmupAccountId,
      previewId,
    );
    const now = Date.now();
    // A revoked preview stays revoked; extending never un-revokes it.
    const base = Math.max(now, current.expiresAt.getTime());
    return this.prisma.contentPreview.update({
      data: { expiresAt: new Date(base + extendByDays * DAY_MS) },
      where: scopedWhere(organizationId, { id: current.id }),
    });
  }

  async getForWarmup(
    organizationId: string,
    warmupAccountId: string,
    previewId: string,
  ): Promise<ContentPreview> {
    const preview = await this.prisma.contentPreview.findFirst({
      where: scopedWhere(organizationId, { id: previewId, warmupAccountId }),
    });
    if (!preview) throw new NotFoundException('Preview', previewId);
    return preview;
  }

  /** Superadmin inventory; the warm-up admin controller runs it platform-wide. */
  async listForWarmups(
    warmupAccountIds: string[],
  ): Promise<Map<string, ContentPreview[]>> {
    const grouped = new Map<string, ContentPreview[]>();
    if (warmupAccountIds.length === 0) return grouped;
    // tenant-scope-ignore: superadmin inventory is platform-wide; callers are the IP-allowlisted warm-up admin controller.
    const previews = await this.prisma.contentPreview.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: { isDeleted: false, warmupAccountId: { in: warmupAccountIds } },
    });
    for (const preview of previews)
      grouped.set(preview.warmupAccountId, [
        ...(grouped.get(preview.warmupAccountId) ?? []),
        preview,
      ]);
    return grouped;
  }

  /**
   * Resolves a token to a preview that is still open, or throws the shared
   * 404. Public requests carry no tenant context: the unguessable token hash
   * is the only credential, and every later read is scoped to the preview's
   * own organization.
   */
  async resolveOpen(token: string): Promise<ContentPreview> {
    if (!TOKEN_PATTERN.test(token)) throw this.unavailable();
    // tenant-scope-ignore: the unguessable token hash is the only credential a logged-out visitor holds.
    const preview = await this.prisma.contentPreview.findFirst({
      where: { isDeleted: false, tokenHash: hashToken(token) },
    });
    if (!preview || preview.revokedAt || preview.expiresAt <= new Date())
      throw this.unavailable();
    const account = await this.prisma.warmupAccount.findFirst({
      select: { id: true },
      where: scopedWhere(preview.organizationId, {
        id: preview.warmupAccountId,
        status: { not: WarmupAccountStatus.ARCHIVED },
      }),
    });
    if (!account) throw this.unavailable();
    return preview;
  }

  async readPublic(token: string): Promise<IPublicContentPreview> {
    return this.project(await this.resolveOpen(token));
  }

  /** Counts one visit. Timestamps and counts only; nothing about the visitor. */
  async recordView(token: string): Promise<void> {
    const preview = await this.resolveOpen(token);
    const now = new Date();
    await this.prisma.contentPreview.updateMany({
      data: { firstViewedAt: now },
      where: scopedWhere(preview.organizationId, {
        firstViewedAt: null,
        id: preview.id,
      }),
    });
    await this.prisma.contentPreview.updateMany({
      data: { lastViewedAt: now, viewCount: { increment: 1 } },
      where: scopedWhere(preview.organizationId, { id: preview.id }),
    });
  }

  async recordCtaClick(token: string): Promise<void> {
    const preview = await this.resolveOpen(token);
    await this.prisma.contentPreview.updateMany({
      data: { ctaClickCount: { increment: 1 } },
      where: scopedWhere(preview.organizationId, { id: preview.id }),
    });
  }

  toView(preview: ContentPreview): IContentPreview {
    return {
      createdAt: preview.createdAt.toISOString(),
      ctaClickCount: preview.ctaClickCount,
      expiresAt: preview.expiresAt.toISOString(),
      id: preview.id,
      items: this.readItems(preview),
      updatedAt: preview.updatedAt.toISOString(),
      viewCount: preview.viewCount,
      warmupAccountId: preview.warmupAccountId,
      ...(preview.claimedAt
        ? { claimedAt: preview.claimedAt.toISOString() }
        : {}),
      ...(preview.firstViewedAt
        ? { firstViewedAt: preview.firstViewedAt.toISOString() }
        : {}),
      ...(preview.lastViewedAt
        ? { lastViewedAt: preview.lastViewedAt.toISOString() }
        : {}),
      ...(preview.revokedAt
        ? { revokedAt: preview.revokedAt.toISOString() }
        : {}),
    };
  }

  private async project(
    preview: ContentPreview,
  ): Promise<IPublicContentPreview> {
    const { organizationId, brandId } = preview;
    const refs = this.readItems(preview);
    const [brand, account, posts] = await Promise.all([
      this.prisma.brand.findFirst({
        where: scopedWhere(organizationId, { id: brandId }),
      }),
      this.prisma.warmupAccount.findFirst({
        select: { diagnostics: true },
        where: scopedWhere(organizationId, { id: preview.warmupAccountId }),
      }),
      this.prisma.post.findMany({
        include: {
          ingredientLinks: {
            orderBy: { position: 'asc' },
            select: {
              ingredient: { select: { category: true, id: true } },
              ingredientId: true,
            },
          },
        },
        where: scopedWhere(organizationId, {
          brandId,
          id: { in: refs.map((ref) => ref.id) },
          publishedAt: null,
          status: 'draft',
        }),
      }),
    ]);
    if (!brand || !account) throw this.unavailable();

    const scope = {
      brandId,
      organizationId,
      userId: preview.createdByUserId,
    };
    const ingredientIds = posts.flatMap((post) =>
      post.ingredientLinks.map((link) => link.ingredientId),
    );
    const projections = await this.mediaUrls.projectIngredients(
      scope,
      ingredientIds,
    );
    const grants = new Map(
      projections.map((projection) => [
        projection.ingredientId,
        projection.grant,
      ]),
    );
    const postById = new Map(posts.map((post) => [post.id, post]));
    // Pinned order wins; a soft-deleted or published post simply drops out.
    const items: IPublicContentPreviewItem[] = refs.flatMap((ref, index) => {
      const post = postById.get(ref.id);
      if (!post) return [];
      const media = post.ingredientLinks.flatMap(
        (link): IPublicContentPreviewMedia[] => {
          const grant = grants.get(link.ingredientId);
          const kind = this.mediaKind(link.ingredient.category);
          if (!grant?.url || grant.state !== 'READY' || !kind) return [];
          return [
            {
              kind,
              url: grant.url,
              ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
            },
          ];
        },
      );
      return [
        {
          id: `item-${index + 1}`,
          media,
          platform: post.platform ?? 'generic',
          text: post.description,
        },
      ];
    });

    const logoUrl = await this.readLogoUrl(scope);
    const diagnostics = account.diagnostics as {
      preparation?: IWarmupPreparation;
    };
    return {
      brand: buildPublicPreviewBrand(brand, diagnostics.preparation, logoUrl),
      expiresAt: preview.expiresAt.toISOString(),
      id: 'preview',
      items,
    };
  }

  private async readLogoUrl(scope: {
    brandId: string;
    organizationId: string;
    userId: string;
  }): Promise<string | undefined> {
    const logo = await this.prisma.asset.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      where: {
        category: AssetCategory.LOGO,
        isDeleted: false,
        parentBrandId: scope.brandId,
        parentOrgId: scope.organizationId,
      },
    });
    if (!logo) return undefined;
    const [projection] = await this.mediaUrls.projectAssets(scope, [logo.id]);
    return projection?.url ?? undefined;
  }

  private mediaKind(
    category: string,
  ): IPublicContentPreviewMedia['kind'] | null {
    if (['IMAGE', 'IMAGE_EDIT'].includes(category)) return 'image';
    if (['VIDEO', 'VIDEO_EDIT'].includes(category)) return 'video';
    return null;
  }

  private readItems(preview: ContentPreview): IContentPreviewItemRef[] {
    return Array.isArray(preview.items)
      ? (preview.items as unknown as IContentPreviewItemRef[]).filter(
          (item) => item?.kind === 'POST' && typeof item.id === 'string',
        )
      : [];
  }

  private unavailable(): NotFoundException {
    return new NotFoundException({ message: 'Preview not found' });
  }
}
