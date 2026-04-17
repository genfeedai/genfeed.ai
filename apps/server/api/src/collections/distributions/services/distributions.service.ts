import { CreateDistributionDto } from '@api/collections/distributions/dto/create-distribution.dto';
import { DistributionEntity } from '@api/collections/distributions/entities/distribution.entity';
import type { DistributionDocument } from '@api/collections/distributions/schemas/distribution.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { DistributionPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class DistributionsService extends BaseService<
  DistributionDocument,
  DistributionEntity,
  Partial<DistributionEntity>
> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'distribution', logger);
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

    const distribution = await this.prisma.distribution.create({
      data: {
        organizationId,
        userId,
        brandId: dto.brandId ?? null,
        status,
        config: {
          caption: dto.caption,
          chatId: dto.chatId,
          contentType: dto.contentType,
          mediaUrl: dto.mediaUrl,
          platform,
          scheduledAt: scheduledAt?.toISOString(),
          text: dto.text,
        },
      },
    });

    this.logger?.log(`${url} created distribution`, {
      distributionId: distribution.id,
      platform,
    });

    return distribution as unknown as DistributionDocument;
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
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    // platform is in config JSON — fetch and filter in-memory for now
    // TODO: add a dedicated platform column for efficient querying
    const allDocs = await this.prisma.distribution.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
    });

    const filtered = filters.platform
      ? allDocs.filter((d) => {
          const config = d.config as Record<string, unknown>;
          return config?.platform === filters.platform;
        })
      : allDocs;

    const total = filtered.length;
    const docs = filtered.slice((page - 1) * limit, page * limit);

    return {
      docs: docs as unknown as DistributionDocument[],
      total,
    };
  }

  async findOneByOrganization(
    id: string,
    organizationId: string,
  ): Promise<DistributionDocument> {
    const distribution = await this.prisma.distribution.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!distribution) {
      throw new NotFoundException('Distribution not found');
    }

    return distribution as unknown as DistributionDocument;
  }

  async markAsPublished(
    id: string,
    telegramMessageId?: string,
  ): Promise<DistributionDocument> {
    const existing = await this.prisma.distribution.findUnique({
      where: { id },
    });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};

    const updated = await this.prisma.distribution.update({
      where: { id },
      data: {
        status: PublishStatus.PUBLISHED,
        config: {
          ...existingConfig,
          publishedAt: new Date().toISOString(),
          ...(telegramMessageId ? { telegramMessageId } : {}),
        },
      },
    });

    return updated as unknown as DistributionDocument;
  }

  async markAsFailed(
    id: string,
    errorMessage: string,
  ): Promise<DistributionDocument> {
    const existing = await this.prisma.distribution.findUnique({
      where: { id },
    });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};

    const updated = await this.prisma.distribution.update({
      where: { id },
      data: {
        status: PublishStatus.FAILED,
        config: { ...existingConfig, errorMessage },
      },
    });

    return updated as unknown as DistributionDocument;
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

    const updated = await this.prisma.distribution.update({
      where: { id },
      data: { status: PublishStatus.CANCELLED },
    });

    return updated as unknown as DistributionDocument;
  }
}
