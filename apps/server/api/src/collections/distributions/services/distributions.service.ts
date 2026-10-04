import { CreateDistributionDto } from '@api/collections/distributions/dto/create-distribution.dto';
import { DistributionEntity } from '@api/collections/distributions/entities/distribution.entity';
import type { DistributionDocument } from '@api/collections/distributions/schemas/distribution.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { DistributionPlatform, PublishStatus } from '@genfeedai/contracts';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

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

  protected normalizeDocument(document: unknown): DistributionDocument {
    const record = document as Record<string, unknown>;
    const config =
      typeof record.config === 'object' && record.config !== null
        ? (record.config as Record<string, unknown>)
        : {};
    return { ...config, ...record } as DistributionDocument;
  }

  async createDistribution(
    organizationId: string,
    userId: string,
    dto: Omit<CreateDistributionDto, 'platform'>,
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
        platform,
        status,
        config: toPrismaJson({
          caption: dto.caption,
          chatId: dto.chatId,
          contentType: dto.contentType,
          credentialId: dto.credentialId,
          mediaUrl: dto.mediaUrl,
          scheduledAt: scheduledAt?.toISOString(),
          text: dto.text,
        }),
      },
    });

    this.logger?.log(`${url} created distribution`, {
      distributionId: distribution.id,
      platform,
    });

    return this.normalizeDocument(distribution);
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
    const where: Record<string, unknown> = scopedWhere(organizationId, {});

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.platform) {
      where.platform = filters.platform;
    }

    const [docs, total] = await Promise.all([
      this.prisma.distribution.findMany({
        where: scopedWhere(organizationId, where),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.distribution.count({
        where: scopedWhere(organizationId, where),
      }),
    ]);

    return {
      docs: docs.map((document) => this.normalizeDocument(document)),
      total,
    };
  }

  async findOneByOrganization(
    id: string,
    organizationId: string,
  ): Promise<DistributionDocument> {
    const distribution = await this.prisma.distribution.findFirst({
      where: scopedWhere(organizationId, { id }),
    });

    if (!distribution) {
      throw new NotFoundException('Distribution');
    }

    return this.normalizeDocument(distribution);
  }

  /**
   * Status transitions are reached from the Telegram delivery path, which runs
   * inside a request (immediate send) or in a worker (scheduled send). The
   * caller's organization, else the request tenant, pins the row; a worker
   * with neither addresses the distribution by its opaque id.
   */
  private transitionWhere(
    id: string,
    organizationId?: string,
  ): Prisma.DistributionWhereInput & { id: string } {
    const scopeOrganizationId =
      organizationId ?? getTenantContext()?.organizationId;

    // tenant-scope-ignore: no organization means a worker caller that holds the opaque distribution id from its own queue payload
    return scopeOrganizationId
      ? scopedWhere(scopeOrganizationId, { id })
      : { id };
  }

  async markAsPublished(
    id: string,
    telegramMessageId?: string,
    organizationId?: string,
  ): Promise<DistributionDocument> {
    const where = this.transitionWhere(id, organizationId);
    // tenant-scope-ignore: transitionWhere pins the request tenant / explicit organization; worker callers address the row by its opaque id
    const existing = await this.prisma.distribution.findFirst({ where });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};

    // tenant-scope-ignore: same transitionWhere scope as the read above
    const updated = await this.prisma.distribution.update({
      where,
      data: {
        status: PublishStatus.PUBLISHED,
        config: {
          ...existingConfig,
          publishedAt: new Date().toISOString(),
          ...(telegramMessageId ? { telegramMessageId } : {}),
        },
      },
    });

    return this.normalizeDocument(updated);
  }

  async markAsFailed(
    id: string,
    errorMessage: string,
    organizationId?: string,
  ): Promise<DistributionDocument> {
    const where = this.transitionWhere(id, organizationId);
    // tenant-scope-ignore: transitionWhere pins the request tenant / explicit organization; worker callers address the row by its opaque id
    const existing = await this.prisma.distribution.findFirst({ where });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};

    // tenant-scope-ignore: same transitionWhere scope as the read above
    const updated = await this.prisma.distribution.update({
      where,
      data: {
        status: PublishStatus.FAILED,
        config: { ...existingConfig, errorMessage },
      },
    });

    return this.normalizeDocument(updated);
  }

  async cancelScheduled(
    id: string,
    organizationId: string,
  ): Promise<DistributionDocument> {
    const distribution = await this.findOneByOrganization(id, organizationId);

    if (distribution.status !== PublishStatus.SCHEDULED) {
      throw new NotFoundException({
        message: 'Only scheduled distributions can be cancelled',
      });
    }

    const updated = await this.prisma.distribution.update({
      where: scopedWhere(organizationId, { id }),
      data: { status: PublishStatus.CANCELLED },
    });

    return this.normalizeDocument(updated);
  }
}
