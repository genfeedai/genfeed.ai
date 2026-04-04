import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import {
  Credential,
  type CredentialDocument,
} from '@api/collections/credentials/schemas/credential.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class CredentialsService extends BaseService<
  CredentialDocument,
  CreateCredentialDto,
  UpdateCredentialDto
> {
  constructor(
    @InjectModel(Credential.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<CredentialDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  findByHandle(
    handle: string,
    organizationId: string,
  ): Promise<CredentialDocument | null> {
    const normalizedHandle = handle.replace(/^@/, '');

    return this.findOne({
      externalHandle: { $regex: new RegExp(`^@?${normalizedHandle}$`, 'i') },
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async saveCredentials(
    brand: { _id: unknown; organization: unknown; [key: string]: unknown },
    platform: CredentialPlatform,
    fields: Partial<Credential>,
  ): Promise<CredentialDocument> {
    const brandId = new Types.ObjectId(String(brand._id));
    const organizationId = new Types.ObjectId(String(brand.organization));
    const userId = new Types.ObjectId(String(brand.user));

    const existing = await this.findOne({
      brand: brandId,
      organization: organizationId,
      platform,
    });

    const { ...tokenData } = fields;

    const entity = new CredentialEntity({
      brand: brandId,
      organization: organizationId,
      platform,
      user: userId,
      ...tokenData,
    });

    if (existing) {
      return this.patch(existing._id, {
        ...entity,
        isDeleted: false,
      });
    }

    return this.create(entity);
  }
}
