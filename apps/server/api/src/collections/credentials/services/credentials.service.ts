import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type {
  Credential,
  CredentialDocument,
} from '@api/collections/credentials/schemas/credential.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CredentialsService extends BaseService<
  CredentialDocument,
  CreateCredentialDto,
  UpdateCredentialDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'credential', logger);
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
