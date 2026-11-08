import {
  ContentPreviewsService,
  DEFAULT_PREVIEW_LIFETIME_DAYS,
  MAX_PREVIEW_ITEMS,
} from '@api/collections/content-previews/services/content-previews.service';
import {
  ExtendContentPreviewDto,
  MintContentPreviewDto,
} from '@api/endpoints/admin/warmup-accounts/dto/content-preview.dto';
import {
  assertWarmupMutable,
  lockWarmup,
  warmupDiagnostics,
  warmupScope,
} from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { IContentPreview } from '@genfeedai/contracts/interfaces';
import type { WarmupAccount } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const TRAILING_SLASH_PATTERN = /\/$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';

/**
 * Operator actions on a workspace's shareable previews. The class-level
 * IpWhitelistGuard + SuperAdminGuard on WarmupAccountsController authorize the
 * caller; every preview is tied to the warm-up workspace's own organization.
 */
@Traced()
@Injectable()
export class WarmupPreviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previews: ContentPreviewsService,
    private readonly config: ConfigService,
  ) {}

  async mint(
    id: string,
    actorUserId: string,
    dto: MintContentPreviewDto,
  ): Promise<IContentPreview> {
    const account = await this.getAccount(id);
    assertWarmupMutable(account);
    const { organizationId, brandId } = warmupScope(account);
    if (!warmupDiagnostics(account).preparation?.contextReviewedAt)
      throw new BadRequestException(
        'Review the brand context before sharing a preview',
      );
    const postIds = [...new Set(dto.postIds ?? [])];
    if (postIds.length === 0)
      throw new BadRequestException('Select the posts to show in the preview');
    if (postIds.length > MAX_PREVIEW_ITEMS)
      throw new BadRequestException(
        `A preview shows at most ${MAX_PREVIEW_ITEMS} pieces`,
      );
    // Only unpublished drafts of the prepared brand can be shown.
    const posts = await this.prisma.post.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: postIds },
        publishedAt: null,
        status: 'draft',
      }),
    });
    if (posts.length !== postIds.length)
      throw new BadRequestException(
        'Every previewed post must be an unpublished draft of the prepared brand',
      );
    const expiresAt = new Date(
      Date.now() +
        (dto.expiresInDays ?? DEFAULT_PREVIEW_LIFETIME_DAYS) * DAY_MS,
    );
    const { preview, token } = await this.previews.create({
      brandId,
      createdByUserId: actorUserId,
      expiresAt,
      items: postIds.map((postId) => ({ id: postId, kind: 'POST' })),
      organizationId,
      warmupAccountId: account.id,
    });
    await this.audit(
      account,
      actorUserId,
      `Minted content preview ${preview.id}.`,
    );
    const brand = await this.prisma.brand.findFirst({
      select: { slug: true },
      where: scopedWhere(organizationId, { id: brandId, isDeleted: false }),
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    return {
      ...this.previews.toView(preview),
      token,
      url: this.buildUrl(brand.slug, token),
    };
  }

  async revoke(
    id: string,
    previewId: string,
    actorUserId: string,
  ): Promise<IContentPreview> {
    const account = await this.getAccount(id);
    const { organizationId } = warmupScope(account);
    const preview = await this.previews.revoke(organizationId, id, previewId);
    await this.audit(
      account,
      actorUserId,
      `Revoked content preview ${preview.id}.`,
    );
    return this.previews.toView(preview);
  }

  async extend(
    id: string,
    previewId: string,
    actorUserId: string,
    dto: ExtendContentPreviewDto,
  ): Promise<IContentPreview> {
    const account = await this.getAccount(id);
    const { organizationId } = warmupScope(account);
    const preview = await this.previews.extend(
      organizationId,
      id,
      previewId,
      dto.extendByDays,
    );
    await this.audit(
      account,
      actorUserId,
      `Extended content preview ${preview.id} by ${dto.extendByDays} days.`,
    );
    return this.previews.toView(preview);
  }

  private async getAccount(id: string): Promise<WarmupAccount> {
    // tenant-scope-ignore: Platform-wide lookup is gated by WarmupAccountsController SuperAdminGuard and IpWhitelistGuard; the account supplies the target organization.
    const account = await this.prisma.warmupAccount.findFirst({
      where: { id, isDeleted: false },
    });
    if (!account) throw new NotFoundException('Warm-up account', id);
    return account;
  }

  private async audit(
    account: WarmupAccount,
    actorUserId: string,
    message: string,
  ): Promise<void> {
    const { organizationId } = warmupScope(account);
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, account.id);
      const current = await tx.warmupAccount.findFirstOrThrow({
        where: scopedWhere(organizationId, { id: account.id }),
        select: { auditEvents: true },
      });
      await tx.warmupAccount.update({
        data: {
          auditEvents: toPrismaJson([
            ...(Array.isArray(current.auditEvents) ? current.auditEvents : []),
            { actorUserId, message, timestamp: new Date().toISOString() },
          ]),
        },
        where: scopedWhere(organizationId, { id: account.id }),
      });
    });
  }

  /**
   * The lead's locked profile on the public site. The handle alone answers
   * 404 while the brand is private; only this key opens the locked view.
   */
  private buildUrl(handle: string, token: string): string {
    const configured = this.config.get('GENFEEDAI_PUBLIC_URL');
    const base =
      typeof configured === 'string' && configured.length > 0
        ? configured.replace(TRAILING_SLASH_PATTERN, '')
        : DEFAULT_WEBSITE_URL;
    return `${base}/u/${encodeURIComponent(handle)}/invite/${token}`;
  }
}
