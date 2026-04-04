import {
  AdCreativeMapping,
  type AdCreativeMappingDocument,
  type AdCreativeMappingStatus,
} from '@api/collections/ad-creative-mappings/schemas/ad-creative-mapping.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

export interface CreateAdCreativeMappingInput {
  organization: string;
  brand?: string;
  genfeedContentId: string;
  externalAdId?: string;
  externalCreativeId?: string;
  adAccountId: string;
  platform?: string;
  status?: AdCreativeMappingStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateAdCreativeMappingInput {
  externalAdId?: string;
  externalCreativeId?: string;
  status?: AdCreativeMappingStatus;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdCreativeMappingsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdCreativeMapping.name, DB_CONNECTIONS.CLOUD)
    private readonly adCreativeMappingModel: Model<AdCreativeMappingDocument>,
    private readonly logger: LoggerService,
  ) {}

  async create(
    input: CreateAdCreativeMappingInput,
  ): Promise<AdCreativeMappingDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.adCreativeMappingModel.create({
        ...input,
        brand: input.brand ? new Types.ObjectId(input.brand) : undefined,
        organization: new Types.ObjectId(input.organization),
        platform: input.platform || 'meta',
        status: input.status || 'draft',
      });

      this.logger.log(`${caller} created mapping ${String(doc._id)}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdCreativeMappingDocument | null> {
    return this.adCreativeMappingModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async findByContentId(
    genfeedContentId: string,
    organizationId: string,
  ): Promise<AdCreativeMappingDocument[]> {
    return this.adCreativeMappingModel
      .find({
        genfeedContentId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async findByExternalAdId(
    externalAdId: string,
    organizationId: string,
  ): Promise<AdCreativeMappingDocument | null> {
    return this.adCreativeMappingModel
      .findOne({
        externalAdId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async findByAdAccount(
    adAccountId: string,
    organizationId: string,
  ): Promise<AdCreativeMappingDocument[]> {
    return this.adCreativeMappingModel
      .find({
        adAccountId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateAdCreativeMappingInput,
  ): Promise<AdCreativeMappingDocument | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.adCreativeMappingModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(id),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          },
          { $set: input },
          { new: true },
        )
        .lean()
        .exec();

      if (doc) {
        this.logger.log(`${caller} updated mapping ${id}`);
      }
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async softDelete(id: string, organizationId: string): Promise<boolean> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.adCreativeMappingModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(id),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          },
          { $set: { isDeleted: true } },
        )
        .exec();

      if (result) {
        this.logger.log(`${caller} soft-deleted mapping ${id}`);
        return true;
      }
      return false;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
