import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

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
  override create(
    createDto: CreateCredentialDto,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    return super.create(
      this.cryptoService.encryptSecretFields(
        createDto as unknown as Record<string, unknown>,
      ) as unknown as CreateCredentialDto,
      populate,
    );
  }

  override patch(
    id: string,
    updateDto: Partial<UpdateCredentialDto> | Record<string, unknown>,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    return super.patch(
      id,
      this.cryptoService.encryptSecretFields(
        updateDto as Record<string, unknown>,
      ),
      populate,
    );
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
    const brandId = String(brand.id ?? brand._id);
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
