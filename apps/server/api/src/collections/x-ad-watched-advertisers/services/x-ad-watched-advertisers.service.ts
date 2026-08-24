import { CreateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/create-x-ad-watched-advertiser.dto';
import { UpdateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/update-x-ad-watched-advertiser.dto';
import type { XAdWatchedAdvertiserDocument } from '@api/collections/x-ad-watched-advertisers/schemas/x-ad-watched-advertiser.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const CREATE_SCALAR_FIELDS = [
  'advertiserHandle',
  'advertiserName',
  'brandId',
  'credentialId',
  'externalAdvertiserId',
  'organizationId',
] as const;

const UPDATE_SCALAR_FIELDS = [
  'advertiserName',
  'externalAdvertiserId',
] as const;

export type XAdIngestionStatus = 'success' | 'error' | 'unavailable';
export type XAdResearchFreshnessState =
  | 'empty'
  | 'fresh'
  | 'stale'
  | 'unavailable';

type XAdWatchedAdvertiserCreateInput = CreateXAdWatchedAdvertiserDto & {
  organizationId?: string;
};

type XAdWatchedAdvertiserUpdateInput =
  Partial<UpdateXAdWatchedAdvertiserDto> & {
    organizationId?: string;
  };

export type XAdWatchedAdvertiserScope = {
  brandId?: string;
  organizationId: string;
};

export type XAdIngestionResult = {
  errorCode?: string;
  freshnessState: XAdResearchFreshnessState;
  recordCount?: number;
  snapshotId?: string;
  status: XAdIngestionStatus;
};

const X_HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/;

/**
 * Org/brand-scoped watchlist of X advertisers whose public ads get ingested
 * from the X Ads Repository export path (#3395). No JSON config column, so
 * `create`/`patch` allow-list scalar fields directly instead of merging a
 * config blob (contrast `WatchlistsService`).
 */
@Injectable()
export class XAdWatchedAdvertisersService extends BaseService<
  XAdWatchedAdvertiserDocument,
  CreateXAdWatchedAdvertiserDto,
  UpdateXAdWatchedAdvertiserDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {
    super(prisma, 'xAdWatchedAdvertiser', logger);
  }

  /**
   * Upsert-on-create-by-handle: a caller re-adding an already-watched handle
   * gets the existing row back (or revived, if it was soft-deleted) rather
   * than a unique-constraint error from `x_ad_watched_advertisers_org_handle_key`.
   */
  override async create(
    createDto: XAdWatchedAdvertiserCreateInput,
    populate: PopulateOption[] = [],
  ): Promise<XAdWatchedAdvertiserDocument> {
    const organizationId = createDto.organizationId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const advertiserHandle = normalizeXHandle(createDto.advertiserHandle);
    const brandId = createDto.brandId ?? null;
    await this.assertBrandAccess(organizationId, brandId);
    await this.assertCredentialAccess(
      organizationId,
      brandId,
      createDto.credentialId,
    );

    const writeInput = {
      ...pickDefinedFields(createDto, CREATE_SCALAR_FIELDS),
      advertiserHandle,
      organizationId,
    };
    const existing = await this.findByHandle(
      organizationId,
      advertiserHandle,
      brandId,
      { includeDeleted: true },
    );

    if (existing) {
      return this.reviveExisting(existing, writeInput, populate);
    }

    try {
      return await super.create(writeInput, populate);
    } catch (error: unknown) {
      if ((error as { code?: unknown })?.code !== 'P2002') {
        throw error;
      }

      const concurrentWinner = await this.findByHandle(
        organizationId,
        advertiserHandle,
        brandId,
        { includeDeleted: true },
      );
      if (!concurrentWinner) {
        throw error;
      }

      return this.reviveExisting(concurrentWinner, writeInput, populate);
    }
  }

  override async patch(
    _id: string,
    _updateDto: Partial<UpdateXAdWatchedAdvertiserDto>,
    _populate: PopulateOption[] = [],
  ): Promise<XAdWatchedAdvertiserDocument> {
    throw new BadRequestException(
      'Organization context is required; use patchScoped',
    );
  }

  override async remove(_id: string): Promise<XAdWatchedAdvertiserDocument> {
    throw new BadRequestException(
      'Organization context is required; use removeScoped',
    );
  }

  async patchScoped(
    id: string,
    updateDto: XAdWatchedAdvertiserUpdateInput,
    scope: XAdWatchedAdvertiserScope,
  ): Promise<XAdWatchedAdvertiserDocument | null> {
    const result = await this.delegate.updateMany({
      data: pickDefinedFields(updateDto, UPDATE_SCALAR_FIELDS),
      where: scopedWhere(scope.organizationId, {
        ...(scope.brandId ? { brandId: scope.brandId } : {}),
        id,
      }),
    });
    if (result.count !== 1) {
      return null;
    }

    return this.findOne({
      id,
      organizationId: scope.organizationId,
    });
  }

  async removeScoped(
    id: string,
    scope: XAdWatchedAdvertiserScope,
  ): Promise<XAdWatchedAdvertiserDocument | null> {
    try {
      return await this.delegate.update({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, {
          ...(scope.brandId ? { brandId: scope.brandId } : {}),
          id,
        }),
      });
    } catch (error: unknown) {
      if ((error as { code?: unknown })?.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  private async reviveExisting(
    existing: XAdWatchedAdvertiserDocument,
    writeInput: XAdWatchedAdvertiserCreateInput,
    _populate: PopulateOption[],
  ): Promise<XAdWatchedAdvertiserDocument> {
    const result = await this.delegate.updateMany({
      data: {
        isDeleted: false,
        ...pickDefinedFields(writeInput, [
          'advertiserName',
          'credentialId',
          'externalAdvertiserId',
        ]),
      },
      where: {
        brandId: existing.brandId,
        id: existing.id,
        organizationId: existing.organizationId,
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException('Watched advertiser changed concurrently');
    }

    const revived = await this.findOne({
      id: existing.id,
      organizationId: existing.organizationId,
    });
    if (!revived) {
      throw new BadRequestException('Watched advertiser could not be restored');
    }

    return revived;
  }

  private async assertBrandAccess(
    organizationId: string,
    brandId: string | null,
  ): Promise<void> {
    if (!brandId) {
      return;
    }

    const brand = await this.prisma.brand.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand) {
      throw new BadRequestException(
        'Brand not found or does not belong to this organization',
      );
    }
  }

  private async assertCredentialAccess(
    organizationId: string,
    brandId: string | null,
    credentialId?: string,
  ): Promise<void> {
    if (!credentialId) {
      return;
    }

    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(organizationId, {
        id: credentialId,
        platform: toPrismaCredentialPlatform(CredentialPlatform.X_ADS),
      }),
    });
    if (
      !credential ||
      (credential.brandId !== null && credential.brandId !== brandId)
    ) {
      throw new BadRequestException(
        'X Ads credential not found in the requested organization and brand scope',
      );
    }
  }

  private async updateIngestionState(
    id: string,
    organizationId: string,
    data: Record<string, unknown>,
  ): Promise<XAdWatchedAdvertiserDocument | null> {
    const result = await this.delegate.updateMany({
      data,
      where: scopedWhere(organizationId, { id }),
    });
    if (result.count !== 1) {
      return null;
    }

    return this.findOne({ id, organizationId });
  }

  private sanitizeErrorCode(errorCode?: string): string | null {
    if (!errorCode) {
      return null;
    }

    return /^[a-z0-9_]{1,120}$/.test(errorCode)
      ? errorCode
      : 'x_ads_repository_unavailable';
  }

  /**
   * Find a watched advertiser by its immutable tenant/brand natural key.
   */
  async findByHandle(
    organizationId: string,
    advertiserHandle: string,
    brandId: string | null = null,
    { includeDeleted = false }: { includeDeleted?: boolean } = {},
  ): Promise<XAdWatchedAdvertiserDocument | null> {
    return this.findOne({
      advertiserHandle: normalizeXHandle(advertiserHandle),
      brandId,
      isDeleted: includeDeleted ? undefined : false,
      organizationId,
    });
  }

  /** Active (non-deleted) watched advertisers for an organization, optionally brand-scoped. */
  async findAllByAccount(
    organizationId: string,
    brandId?: string,
  ): Promise<XAdWatchedAdvertiserDocument[]> {
    return this.find(scopedWhere(organizationId, brandId ? { brandId } : {}));
  }

  /** Record freshness without exposing raw provider errors or advancing success on failure. */
  async recordIngestionResult(
    id: string,
    organizationId: string,
    result: XAdIngestionResult,
  ): Promise<XAdWatchedAdvertiserDocument | null> {
    const attemptedAt = new Date();
    return this.updateIngestionState(id, organizationId, {
      freshnessState: result.freshnessState,
      lastAttemptedAt: attemptedAt,
      lastIngestionErrorCode:
        result.status === 'success'
          ? null
          : this.sanitizeErrorCode(result.errorCode),
      lastIngestionStatus: result.status,
      ...(result.status === 'success'
        ? {
            ...(result.snapshotId ? { lastSnapshotId: result.snapshotId } : {}),
            ...(result.recordCount === undefined
              ? {}
              : { lastSnapshotRecordCount: result.recordCount }),
            lastSuccessfulAt: attemptedAt,
          }
        : {}),
    });
  }
}

function normalizeXHandle(value: string): string {
  const normalized = value.trim().replace(/^@/, '').toLowerCase();
  if (!X_HANDLE_PATTERN.test(normalized)) {
    throw new BadRequestException('Invalid X advertiser handle');
  }
  return normalized;
}
