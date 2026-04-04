import type { CreateDistributionDto } from '@api/collections/distributions/dto/create-distribution.dto';
import { DistributionEntity } from '@api/collections/distributions/entities/distribution.entity';
import {
  Distribution,
  type DistributionDocument,
} from '@api/collections/distributions/schemas/distribution.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { DistributionPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class DistributionsService extends BaseService<
  DistributionDocument,
  DistributionEntity,
  Partial<DistributionEntity>
> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Distribution.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<DistributionDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  async createDistribution(
    organizationId: string,
    userId: string,
    dto: CreateDistributionDto,
    platform: DistributionPlatform,
    status: PublishStatus = PublishStatus.PUBLISHING,
    scheduledAt?: Date,
  ): Promise<DistributionDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const entity = new DistributionEntity({
      brand: dto.brandId ? new Types.ObjectId(dto.brandId) : undefined,
      caption: dto.caption,
      chatId: dto.chatId,
      contentType: dto.contentType,
      mediaUrl: dto.mediaUrl,
      organization: new Types.ObjectId(organizationId),
      platform,
      scheduledAt,
      status,
      text: dto.text,
      user: new Types.ObjectId(userId),
    });

    const distribution = await this.create(entity);

    this.logger?.log(`${url} created distribution`, {
      distributionId: distribution._id,
      platform,
    });

    return distribution;
  }

  async findByOrganization(
    organizationId: string,
    filters: {
      platform?: DistributionPlatform;
      status?: PublishStatus;
    } = {},
    page = 1,
    limit = 20,
  ): Promise<{ docs: DistributionDocument[]; total: number }> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (filters.platform) {
      query.platform = filters.platform;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    const result = await this.findAll(
      [{ $match: query }, { $sort: { createdAt: -1 } }],
      { limit, page },
    );

    return { docs: result.docs, total: result.totalDocs };
  }

  async findOneByOrganization(
    id: string,
    organizationId: string,
  ): Promise<DistributionDocument> {
    const distribution = await this.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!distribution) {
      throw new NotFoundException('Distribution not found');
    }

    return distribution;
  }

  markAsPublished(
    id: string,
    telegramMessageId?: string,
  ): Promise<DistributionDocument> {
    return this.patch(id, {
      publishedAt: new Date(),
      status: PublishStatus.PUBLISHED,
      ...(telegramMessageId && { telegramMessageId }),
    });
  }

  markAsFailed(
    id: string,
    errorMessage: string,
  ): Promise<DistributionDocument> {
    return this.patch(id, {
      errorMessage,
      status: PublishStatus.FAILED,
    });
  }

  async cancelScheduled(
    id: string,
    organizationId: string,
  ): Promise<DistributionDocument> {
    const distribution = await this.findOneByOrganization(id, organizationId);

    if (distribution.status !== PublishStatus.SCHEDULED) {
      throw new NotFoundException(
        'Only scheduled distributions can be cancelled',
      );
    }

    return this.patch(id, {
      status: PublishStatus.CANCELLED,
    });
  }
}
