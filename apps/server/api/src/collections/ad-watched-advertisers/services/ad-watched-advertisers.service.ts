import { CreateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/create-ad-watched-advertiser.dto';
import { UpdateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/update-ad-watched-advertiser.dto';
import type { AdWatchedAdvertiserDocument } from '@api/collections/ad-watched-advertisers/schemas/ad-watched-advertiser.schema';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { PaidCreativePlatform } from '@genfeedai/integrations/ads';
import {
  isPaidCreativePlatform,
  normalizeAdvertiserHandle,
} from '@genfeedai/integrations/ads';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const CREATE_SCALAR_FIELDS = [
  'advertiserHandle',
  'advertiserName',
  'brandId',
  'credentialId',
  'externalAdvertiserId',
  'organizationId',
  'platform',
] as const;

const UPDATE_SCALAR_FIELDS = [
  'advertiserName',
  'externalAdvertiserId',
] as const;

export type AdIngestionStatus = 'success' | 'error' | 'unavailable';
export type AdResearchFreshnessState =
  | 'empty'
  | 'fresh'
  | 'stale'
  | 'unavailable';

type AdWatchedAdvertiserCreateInput = CreateAdWatchedAdvertiserDto & {
  organizationId?: string;
};

type AdWatchedAdvertiserUpdateInput = Partial<UpdateAdWatchedAdvertiserDto> & {
  organizationId?: string;
};

export type AdWatchedAdvertiserScope = {
  brandId?: string;
  organizationId: string;
};

export type AdIngestionResult = {
  errorCode?: string;
  freshnessState: AdResearchFreshnessState;
  recordCount?: number;
  snapshotId?: string;
  status: AdIngestionStatus;
};

/**
 * Credential platform that gates ingestion for each watched platform. Only X
 * actually requires a tenant credential today — the Meta, TikTok, and Google
 * transparency archives are public — but a caller may still pin a credential,
 * and when they do it must be the right one for that platform.
 */
const CREDENTIAL_PLATFORM_BY_PLATFORM: Record<
  PaidCreativePlatform,
  CredentialPlatform
> = {
  google: CredentialPlatform.GOOGLE_ADS,
  meta: CredentialPlatform.FACEBOOK,
  tiktok: CredentialPlatform.TIKTOK,
  x: CredentialPlatform.X_ADS,
  youtube: CredentialPlatform.GOOGLE_ADS,
};

/**
 * Org/brand-scoped watchlist of competitor advertisers whose public paid
 * creatives get ingested from the transparency archive of their platform
 * (#3395, #3537). No JSON config column, so `create`/`patch` allow-list
 * scalar fields directly instead of merging a config blob (contrast
 * `WatchlistsService`).
 */
@Injectable()
export class AdWatchedAdvertisersService extends BaseService<
  AdWatchedAdvertiserDocument,
  CreateAdWatchedAdvertiserDto,
  UpdateAdWatchedAdvertiserDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {
    super(prisma, 'adWatchedAdvertiser', logger);
  }

  /**
   * Upsert-on-create-by-handle: a caller re-adding an already-watched handle
   * gets the existing row back (or revived, if it was soft-deleted) rather
   * than a unique-constraint error from
   * `ad_watched_advertisers_org_brand_platform_handle_key`. Uniqueness is per
   * platform: the same brand name may legitimately be watched on Meta and on
   * TikTok as two rows.
   */
  override async create(
    createDto: AdWatchedAdvertiserCreateInput,
    populate: PopulateOption[] = [],
  ): Promise<AdWatchedAdvertiserDocument> {
    const organizationId = createDto.organizationId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const platform = resolvePlatform(createDto.platform);
    const advertiserHandle = normalizeHandle(
      platform,
      createDto.advertiserHandle,
    );
    const brandId = createDto.brandId ?? null;
    await this.assertBrandAccess(organizationId, brandId);
    await this.assertCredentialAccess(
      organizationId,
      brandId,
      platform,
      createDto.credentialId,
    );

    const writeInput = {
      ...pickDefinedFields(createDto, CREATE_SCALAR_FIELDS),
      advertiserHandle,
      organizationId,
      platform,
    };
    const existing = await this.findByHandle(
      organizationId,
      platform,
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
        platform,
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
    _updateDto: Partial<UpdateAdWatchedAdvertiserDto>,
    _populate: PopulateOption[] = [],
  ): Promise<AdWatchedAdvertiserDocument> {
    throw new BadRequestException(
      'Organization context is required; use patchScoped',
    );
  }

  override async remove(_id: string): Promise<AdWatchedAdvertiserDocument> {
    throw new BadRequestException(
      'Organization context is required; use removeScoped',
    );
  }

  async patchScoped(
    id: string,
    updateDto: AdWatchedAdvertiserUpdateInput,
    scope: AdWatchedAdvertiserScope,
  ): Promise<AdWatchedAdvertiserDocument | null> {
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
    scope: AdWatchedAdvertiserScope,
  ): Promise<AdWatchedAdvertiserDocument | null> {
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
    existing: AdWatchedAdvertiserDocument,
    writeInput: AdWatchedAdvertiserCreateInput,
    _populate: PopulateOption[],
  ): Promise<AdWatchedAdvertiserDocument> {
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
    platform: PaidCreativePlatform,
    credentialId?: string,
  ): Promise<void> {
    if (!credentialId) {
      return;
    }

    const credentialPlatform = CREDENTIAL_PLATFORM_BY_PLATFORM[platform];
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(organizationId, {
        id: credentialId,
        platform: toPrismaCredentialPlatform(credentialPlatform),
      }),
    });
    if (
      !credential ||
      (credential.brandId !== null && credential.brandId !== brandId)
    ) {
      throw new BadRequestException(
        `${credentialPlatform} credential not found in the requested organization and brand scope`,
      );
    }
  }

  private async updateIngestionState(
    id: string,
    organizationId: string,
    data: Record<string, unknown>,
  ): Promise<AdWatchedAdvertiserDocument | null> {
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
      : 'paid_creative_source_unavailable';
  }

  /**
   * Find a watched advertiser by its immutable tenant/brand natural key.
   */
  async findByHandle(
    organizationId: string,
    platform: PaidCreativePlatform,
    advertiserHandle: string,
    brandId: string | null = null,
    { includeDeleted = false }: { includeDeleted?: boolean } = {},
  ): Promise<AdWatchedAdvertiserDocument | null> {
    return this.findOne({
      advertiserHandle: normalizeHandle(platform, advertiserHandle),
      brandId,
      isDeleted: includeDeleted ? undefined : false,
      organizationId,
      platform,
    });
  }

  /**
   * Active (non-deleted) watched advertisers for an organization, optionally
   * narrowed to one brand and/or one platform. Ingestion runs per platform,
   * so the platform filter is what keeps a Meta run from touching X rows.
   */
  async findAllByAccount(
    organizationId: string,
    brandId?: string,
    platform?: PaidCreativePlatform,
  ): Promise<AdWatchedAdvertiserDocument[]> {
    return this.find(
      scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        ...(platform ? { platform } : {}),
      }),
    );
  }

  /** Record freshness without exposing raw provider errors or advancing success on failure. */
  async recordIngestionResult(
    id: string,
    organizationId: string,
    result: AdIngestionResult,
  ): Promise<AdWatchedAdvertiserDocument | null> {
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

function resolvePlatform(value: string | undefined): PaidCreativePlatform {
  const platform = value?.trim().toLowerCase() ?? '';
  if (!isPaidCreativePlatform(platform)) {
    throw new BadRequestException(`Unsupported ad platform: ${value}`);
  }
  return platform;
}

function normalizeHandle(
  platform: PaidCreativePlatform,
  value: string,
): string {
  const normalized = normalizeAdvertiserHandle(platform, value);
  if (!normalized) {
    throw new BadRequestException(`Invalid ${platform} advertiser handle`);
  }
  return normalized;
}
