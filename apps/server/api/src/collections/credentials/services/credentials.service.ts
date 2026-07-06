import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { PlanLimitExceededException } from '@api/helpers/exceptions/business/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { IS_CLOUD_MODE } from '@genfeedai/config';
import { CredentialPlatform } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import {
  getChannelLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

function readStringId(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') {
      return record.id;
    }
    if (typeof record._id === 'string') {
      return record._id;
    }
  }

  return '';
}

@Injectable()
export class CredentialsService extends BaseService<
  CredentialDocument,
  CreateCredentialDto,
  UpdateCredentialDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly cryptoService: CredentialCryptoService,
  ) {
    super(prisma, 'credential', logger);
  }

  /**
   * Encrypt-on-write boundary. Every credential secret (access/refresh tokens
   * and token secrets) is encrypted here before it reaches the database — and
   * before `BaseService` logs the payload — so providers can persist tokens
   * without each having to remember to encrypt. Decryption stays explicit at
   * each read site (see `CredentialHelper.getDecryptedCredential`). The crypto
   * is idempotent, so values that arrive already encrypted are left untouched.
   */
  override async create(
    createDto: CreateCredentialDto,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    await this.assertChannelLimitForConnect(
      null,
      createDto as unknown as Record<string, unknown>,
    );

    return super.create(
      this.cryptoService.encryptSecretFields(
        createDto as unknown as Record<string, unknown>,
      ) as unknown as CreateCredentialDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateCredentialDto> | Record<string, unknown>,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    await this.assertChannelLimitForConnect(
      id,
      updateDto as Record<string, unknown>,
    );

    return super.patch(
      id,
      this.cryptoService.encryptSecretFields(
        updateDto as Record<string, unknown>,
      ),
      populate,
    );
  }

  private async assertChannelLimitForConnect(
    credentialId: string | null,
    mutation: Record<string, unknown>,
  ): Promise<void> {
    if (!IS_CLOUD_MODE || mutation.isConnected !== true) {
      return;
    }

    const existing = credentialId
      ? await this.findOne({ _id: credentialId })
      : null;

    if (existing?.isConnected === true && existing.isDeleted !== true) {
      return;
    }

    const organizationId = readStringId(
      mutation.organizationId ??
        mutation.organization ??
        existing?.organizationId ??
        existing?.organization,
    );

    if (!organizationId) {
      return;
    }

    const setting = await this.prisma.organizationSetting.findUnique({
      select: { subscriptionTier: true },
      where: { organizationId },
    });
    const tier = setting?.subscriptionTier ?? null;
    const channelLimit = getChannelLimitForTier(tier);

    if (channelLimit === null) {
      return;
    }

    const connectedCount = await this.countConnected(organizationId);

    if (connectedCount < channelLimit) {
      return;
    }

    throw new PlanLimitExceededException({
      currentCount: connectedCount,
      limit: channelLimit,
      resource: 'channels',
      upgradeTier: getUpgradeTierForLimit('channels', tier),
    });
  }

  override patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    return super.patchAll(
      filter,
      this.cryptoService.encryptSecretFields(update),
    );
  }

  countConnected(organizationId: string, brandId?: string): Promise<number> {
    return this.prisma.credential.count({
      where: {
        isConnected: true,
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    });
  }

  findByHandle(
    handle: string,
    organizationId: string,
  ): Promise<CredentialDocument | null> {
    const normalizedHandle = handle.replace(/^@/, '');

    return this.findOne({
      externalHandle: { contains: normalizedHandle, mode: 'insensitive' },
      isConnected: true,
      isDeleted: false,
      organizationId,
    });
  }

  async saveCredentials(
    brand: {
      id?: unknown;
      _id?: unknown;
      organizationId?: unknown;
      organization?: unknown;
      userId?: unknown;
      user?: unknown;
      [key: string]: unknown;
    },
    platform: CredentialPlatform,
    fields: Partial<Record<string, unknown>>,
  ): Promise<CredentialDocument> {
    const brandId = String(brand.id);
    const organizationId = String(brand.organizationId ?? brand.organization);
    const userId = String(brand.userId ?? brand.user);

    const existing = await this.findOne({
      brandId,
      organizationId,
      platform,
    });

    const { ...tokenData } = fields;

    const entity = new CredentialEntity({
      brandId,
      organizationId,
      platform,
      userId,
      ...tokenData,
    });

    if (existing) {
      return this.patch((existing as Record<string, unknown>).id as string, {
        ...entity,
        isDeleted: false,
      });
    }

    return this.create(entity as unknown as CreateCredentialDto);
  }
}
