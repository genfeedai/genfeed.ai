import { createHash, randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandFontAssetsQueryDto } from '@api/collections/brands/dto/brand-font-assets-query.dto';
import {
  computeBrandFontUploadId,
  encodeBrandFontCursor,
  FONT_UPLOAD_MAX_BYTES,
  parseBrandFontCursor,
  validateBrandFontUpload,
} from '@api/collections/brands/utils/brand-font-upload.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { AssetCategory, AssetParent, MemberRole } from '@genfeedai/contracts';
import { type Asset, Prisma } from '@genfeedai/prisma';
import {
  assertSafeObjectKey,
  assertSafeSegment,
  createStorageProvider,
} from '@genfeedai/storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const MAX_FONT_LIST_SCANS = 5;
type ValidatedBrandFontUpload = ReturnType<typeof validateBrandFontUpload>;
export interface BrandFontActor {
  isApiKey?: boolean;
  apiKeyId?: string;
  scopes?: string[];
  organizationId: string;
  brandId: string;
  actorId: string;
}
export interface BrandFontUploadInput {
  requestId: string;
  displayName?: string;
  file: Express.Multer.File;
}
export interface BrandFontUploadResult {
  asset: Asset;
  created: boolean;
}
export interface BrandFontAssetListResult {
  docs: Asset[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}
@Injectable()
export class BrandFontAssetsService {
  private readonly storage = createStorageProvider();
  private readonly logger = new Logger(BrandFontAssetsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccessService: BrandAccessService,
  ) {}
  private async assertAccess(
    client: Prisma.TransactionClient,
    actor: BrandFontActor,
    write: boolean,
  ): Promise<void> {
    if (
      ![actor.organizationId, actor.brandId, actor.actorId].every(
        (value) => typeof value === 'string' && value.length > 0,
      )
    )
      throw new ForbiddenException('font_asset_access_denied');
    if (isCloudDeployment()) {
      const principal = { ...actor, userId: actor.actorId };
      try {
        await this.brandAccessService.assert(principal, actor.brandId, client);
        if (write) {
          const { role } = await this.brandAccessService.resolve(
            principal,
            client,
          );
          if (role !== MemberRole.OWNER && role !== MemberRole.ADMIN)
            throw new ForbiddenException();
        }
      } catch {
        throw new ForbiddenException('font_asset_access_denied');
      }
      return;
    }
    const [organization, brand, member] = await Promise.all([
      client.organization.findFirst({
        where: { id: actor.organizationId, isDeleted: false },
        select: { id: true },
      }),
      client.brand.findFirst({
        where: {
          id: actor.brandId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      client.member.findFirst({
        where: {
          userId: actor.actorId,
          organizationId: actor.organizationId,
          isDeleted: false,
          isActive: true,
        },
        include: { role: true, brands: { select: { id: true } } },
      }),
    ]);
    if (!organization || !brand || !member)
      throw new ForbiddenException('font_asset_access_denied');
    const privileged =
      member.role.key === MemberRole.OWNER ||
      member.role.key === MemberRole.ADMIN;
    if (
      (write && !privileged) ||
      (!privileged &&
        member.brands.length &&
        !member.brands.some((assigned) => assigned.id === actor.brandId))
    )
      throw new ForbiddenException('font_asset_access_denied');
  }
  private async lockBrand(
    tx: Prisma.TransactionClient,
    actor: BrandFontActor,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM brands WHERE id=${actor.brandId} AND "organizationId"=${actor.organizationId} AND "isDeleted"=false FOR UPDATE`,
    );
    await this.assertAccess(tx, actor, true);
  }
  private scope(actor: BrandFontActor): Prisma.AssetWhereInput {
    return {
      parentType: AssetParent.BRAND,
      parentOrgId: actor.organizationId,
      parentBrandId: actor.brandId,
      category: AssetCategory.FONT,
      isDeleted: false,
    };
  }
  private owned(asset: Asset, actor: BrandFontActor): boolean {
    return (
      asset.parentType === AssetParent.BRAND &&
      asset.parentOrgId === actor.organizationId &&
      asset.parentBrandId === actor.brandId &&
      asset.category === AssetCategory.FONT
    );
  }
  private validateStored(asset: Asset): void {
    const valid =
      asset.mimeType === 'font/woff2' &&
      typeof asset.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(asset.sha256) &&
      typeof asset.sizeBytes === 'number' &&
      Number.isInteger(asset.sizeBytes) &&
      asset.sizeBytes >= 48 &&
      asset.sizeBytes <= FONT_UPLOAD_MAX_BYTES &&
      typeof asset.cloudObjectKey === 'string' &&
      asset.cloudObjectKey.length > 0;
    if (!valid) throw new ServiceUnavailableException('font_asset_unavailable');
    try {
      assertSafeObjectKey(
        asset.cloudObjectKey ?? '',
        () => new Error('font_asset_unavailable'),
      );
    } catch {
      throw new ServiceUnavailableException('font_asset_unavailable');
    }
    if (
      asset.originalFileName !== null &&
      (!asset.originalFileName ||
        Array.from(asset.originalFileName).length > 256)
    )
      throw new ServiceUnavailableException('font_asset_unavailable');
    if (
      asset.displayName !== null &&
      (!asset.displayName || asset.displayName.length > 256)
    )
      throw new ServiceUnavailableException('font_asset_unavailable');
  }
  private replay(
    asset: Asset,
    actor: BrandFontActor,
    upload: ValidatedBrandFontUpload,
  ): BrandFontUploadResult {
    if (!this.owned(asset, actor) || asset.isDeleted)
      throw new ConflictException('font_asset_conflict');
    this.validateStored(asset);
    if (
      asset.sha256 !== upload.sha256 ||
      asset.sizeBytes !== upload.sizeBytes ||
      asset.displayName !== upload.displayName
    )
      throw new ConflictException('font_asset_conflict');
    return { asset, created: false };
  }
  async list(
    actor: BrandFontActor,
    query: BrandFontAssetsQueryDto,
  ): Promise<BrandFontAssetListResult> {
    await this.assertAccess(this.prisma, actor, false);
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException('font_asset_invalid');
    let cursor =
      query.cursor === undefined ? null : parseBrandFontCursor(query.cursor);
    const docs: Asset[] = [];
    let hasMore = false;
    let last: Asset | undefined;
    // Invalid rows are skipped; keep scanning (bounded) so a page stays full
    // whenever more valid rows exist and clients never see a short page with hasMore.
    for (let scan = 0; scan < MAX_FONT_LIST_SCANS; scan++) {
      const rows = await this.prisma.asset.findMany({
        where: {
          ...this.scope(actor),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: new Date(cursor.createdAt) } },
                  {
                    createdAt: new Date(cursor.createdAt),
                    id: { lt: cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const batch = rows.slice(0, limit);
      const more = rows.length > limit;
      let isFull = false;
      for (const [index, row] of batch.entries()) {
        last = row;
        try {
          this.validateStored(row);
        } catch {
          this.logger.warn(`font_asset_row_skipped ${row.id}`);
          continue;
        }
        docs.push(row);
        if (docs.length === limit) {
          hasMore = more || index < batch.length - 1;
          isFull = true;
          break;
        }
      }
      if (isFull) break;
      hasMore = more;
      if (!more || !last) break;
      cursor = { createdAt: last.createdAt.toISOString(), id: last.id };
    }
    return {
      docs,
      limit,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeBrandFontCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }
  private key(actor: BrandFontActor, id: string): string {
    const error = () => new BadRequestException('font_asset_invalid');
    for (const segment of [actor.organizationId, actor.brandId, id])
      assertSafeSegment(segment, 'font key', error);
    return assertSafeObjectKey(
      `brand-fonts/${actor.organizationId}/${actor.brandId}/${id}/${randomUUID()}.woff2`,
      error,
    );
  }
  private checkSignal(signal?: AbortSignal): void {
    if (signal?.aborted)
      throw new ServiceUnavailableException('font_asset_unavailable');
  }
  private async cleanup(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn('font_asset_cleanup_failed');
    }
  }
  private async store(
    upload: ValidatedBrandFontUpload,
    key: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.checkSignal(signal);
    try {
      await this.storage.upload(upload.buffer, key, 'font/woff2');
      this.checkSignal(signal);
      const bytes = await this.storage.readBytes(key, {
        maxBytes: FONT_UPLOAD_MAX_BYTES,
        timeoutMs: 15000,
        signal,
      });
      this.checkSignal(signal);
      if (
        bytes.length !== upload.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== upload.sha256
      )
        throw new Error('font_asset_unavailable');
    } catch {
      throw new ServiceUnavailableException('font_asset_unavailable');
    }
  }
  private async publish(
    actor: BrandFontActor,
    id: string,
    upload: ValidatedBrandFontUpload,
    key: string,
    signal?: AbortSignal,
  ): Promise<BrandFontUploadResult> {
    this.checkSignal(signal);
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockBrand(tx, actor);
        const existing = await tx.asset.findFirst({
          where: { id, parentOrgId: actor.organizationId },
        });
        if (existing) return this.replay(existing, actor, upload);
        this.checkSignal(signal);
        const asset = await tx.asset.create({
          data: {
            id,
            userId: actor.actorId,
            parentType: AssetParent.BRAND,
            parentOrgId: actor.organizationId,
            parentBrandId: actor.brandId,
            parentIngredientId: null,
            parentArticleId: null,
            category: AssetCategory.FONT,
            cloudObjectKey: key,
            sha256: upload.sha256,
            sizeBytes: upload.sizeBytes,
            mimeType: 'font/woff2',
            originalFileName: upload.originalFileName,
            displayName: upload.displayName,
            isDeleted: false,
            kind: null,
            origin: null,
            residency: null,
            uploadPolicy: null,
          },
        });
        return { asset, created: true };
      },
      { maxWait: 5000, timeout: 5000 },
    );
  }
  async upload(
    actor: BrandFontActor,
    input: BrandFontUploadInput,
    signal?: AbortSignal,
  ): Promise<BrandFontUploadResult> {
    await this.assertAccess(this.prisma, actor, true);
    const upload = validateBrandFontUpload(input);
    const id = computeBrandFontUploadId(
      actor.organizationId,
      actor.brandId,
      input.requestId,
    );
    const existing = await this.prisma.asset.findFirst({
      where: { id, parentOrgId: actor.organizationId },
    });
    if (existing)
      return this.prisma.$transaction(
        async (tx) => {
          await this.lockBrand(tx, actor);
          const current = await tx.asset.findFirst({
            where: { id, parentOrgId: actor.organizationId },
          });
          if (!current) throw new ConflictException('font_asset_conflict');
          return this.replay(current, actor, upload);
        },
        { maxWait: 5000, timeout: 5000 },
      );
    const key = this.key(actor, id);
    let committed = false;
    try {
      await this.store(upload, key, signal);
      const result = await this.publish(actor, id, upload, key, signal);
      committed = result.created;
      if (!result.created) await this.cleanup(key);
      return result;
    } catch (error) {
      if (!committed) await this.cleanup(key);
      if (
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException('font_asset_unavailable');
    }
  }
  async remove(actor: BrandFontActor, assetId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockBrand(tx, actor);
        const asset = await tx.asset.findFirst({
          where: { id: assetId, parentOrgId: actor.organizationId },
        });
        if (!asset || !this.owned(asset, actor))
          throw new NotFoundException({ message: 'font_asset_unavailable' });
        this.validateStored(asset);
        if (!asset.isDeleted)
          await tx.asset.update({
            where: { id: assetId },
            data: { isDeleted: true },
          });
      },
      { maxWait: 5000, timeout: 5000 },
    );
  }
}
