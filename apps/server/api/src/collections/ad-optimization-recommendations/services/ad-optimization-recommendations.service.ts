import type {
  RecommendationStatus,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class AdOptimizationRecommendationsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async createBatch(
    recommendations: Record<string, unknown>[],
  ): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.prisma.adOptimizationRecommendation.createMany({
        data: recommendations as never,
        skipDuplicates: true,
      });
      this.logger.log(`${caller} created ${result.count} recommendations`);
      return result.count;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      status?: RecommendationStatus;
      recommendationType?: RecommendationType;
      limit?: number;
      offset?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adOptimizationRecommendation.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.offset ?? 0,
      take: params?.limit ?? 50,
      where: {
        isDeleted: false,
        organizationId,
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.recommendationType
          ? { recommendationType: params.recommendationType }
          : {}),
      },
    });
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adOptimizationRecommendation.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });
  }

  async approve(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.updateStatus(id, organizationId, 'approved', 'pending');
  }

  async reject(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.updateStatus(id, organizationId, 'rejected', 'pending');
  }

  async markExecuted(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.updateStatus(id, organizationId, 'executed', 'approved');
  }

  async expireStale(): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.prisma.adOptimizationRecommendation.updateMany({
        data: { status: 'expired' },
        where: {
          expiresAt: { lte: new Date() },
          isDeleted: false,
          status: 'pending',
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `${caller} expired ${result.count} stale recommendations`,
        );
      }

      return result.count;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findExistingPending(
    organizationId: string,
    entityId: string,
    recommendationType: RecommendationType,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adOptimizationRecommendation.findFirst({
      where: {
        entityId,
        isDeleted: false,
        organizationId,
        recommendationType,
        status: 'pending',
      },
    });
  }

  private async updateStatus(
    id: string,
    organizationId: string,
    status: RecommendationStatus,
    expectedCurrentStatus: RecommendationStatus,
  ): Promise<Record<string, unknown> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adOptimizationRecommendation.findFirst(
        {
          where: { id, isDeleted: false, organizationId },
        },
      );

      if (!existing) {
        return null;
      }

      if (
        (existing as Record<string, unknown>).status !== expectedCurrentStatus
      ) {
        throw new ConflictException(
          `Cannot transition recommendation ${id} to '${status}': expected status '${expectedCurrentStatus}' but found '${(existing as Record<string, unknown>).status as string}'`,
        );
      }

      const doc = await this.prisma.adOptimizationRecommendation.update({
        data: { status },
        where: { id },
      });

      this.logger.log(`${caller} updated recommendation ${id} to ${status}`);
      return doc;
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
