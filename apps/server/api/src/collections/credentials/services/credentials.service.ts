import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CredentialPlatform, FileInputType } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

export interface ExternalCredentialProfile {
  avatarUrl?: string | null;
  handle?: string | null;
  id?: string | null;
  name?: string | null;
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
    private readonly filesClientService: FilesClientService,
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

  /**
   * Persist public provider identity and mirror its avatar into Genfeed-owned
   * storage. OAuth remains successful when avatar import fails; in that case
   * the previous S3 avatar is preserved and the UI uses its fallback.
   */
  async updateExternalProfile(
    credentialId: string,
    organizationId: string,
    profile: ExternalCredentialProfile,
  ): Promise<CredentialDocument> {
    const credential = await this.findOne({
      id: credentialId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!credential) {
      throw new Error(`Credential ${credentialId} not found`);
    }

    const update: Record<string, string> = {};

    if (profile.handle) {
      update.externalHandle = profile.handle;
    }
    if (profile.id) {
      update.externalId = profile.id;
    }
    if (profile.name) {
      update.externalName = profile.name;
    }

    if (profile.avatarUrl) {
      try {
        const parsedAvatarUrl = new URL(profile.avatarUrl);
        if (!['http:', 'https:'].includes(parsedAvatarUrl.protocol)) {
          throw new Error('Credential avatar URL must use http or https');
        }
        assertUrlNotPrivate(profile.avatarUrl);
        const metadata = await this.filesClientService.uploadToS3(
          credentialId,
          'social-avatars',
          {
            type: FileInputType.URL,
            url: profile.avatarUrl,
          },
        );

        if (metadata.publicUrl) {
          update.externalAvatar = metadata.publicUrl;
        }
      } catch (error: unknown) {
        this.logger.warn('Failed to import credential avatar', {
          credentialId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (Object.keys(update).length === 0) {
      return credential;
    }

    return this.patch(credential.id, update);
  }
}
