import type {
  AdOptimizationRecommendationDocument,
  RecommendationStatus,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AdOptimizationRecommendation as PrismaAdOptimizationRecommendation } from '@genfeedai/prisma';
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
    recommendations: Partial<AdOptimizationRecommendationDocument>[],
  ): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.prisma.adOptimizationRecommendation.createMany({
        data: recommendations.map((recommendation) =>
          this.toCreateManyInput(recommendation),
        ) as never,
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
  ): Promise<AdOptimizationRecommendationDocument[]> {
    const docs = await this.prisma.adOptimizationRecommendation.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.offset ?? 0,
      take: params?.limit ?? 50,
      where: {
        isDeleted: false,
        organizationId,
      },
    });

    return docs
      .map((doc) => this.toDocument(doc))
      .filter(
        (doc) =>
          (!params?.status || doc.status === params.status) &&
          (!params?.recommendationType ||
            doc.recommendationType === params.recommendationType),
      );
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    const doc = await this.prisma.adOptimizationRecommendation.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });

    return doc ? this.toDocument(doc) : null;
  }

  async approve(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'approved', 'pending');
  }

  async reject(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'rejected', 'pending');
  }

  async markExecuted(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'executed', 'approved');
  }

  async expireStale(): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const docs = await this.prisma.adOptimizationRecommendation.findMany({
        where: {
          isDeleted: false,
        },
      });

      let count = 0;
      for (const doc of docs.map((item) => this.toDocument(item))) {
        const expiresAt =
          doc.expiresAt instanceof Date
            ? doc.expiresAt
            : doc.expiresAt
              ? new Date(doc.expiresAt)
              : null;

        if (doc.status !== 'pending' || !expiresAt || expiresAt > new Date()) {
          continue;
        }

        await this.updateStatus(doc.id, doc.organization, 'expired', 'pending');
        count++;
      }

      if (count > 0) {
        this.logger.log(`${caller} expired ${count} stale recommendations`);
      }

      return count;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findExistingPending(
    organizationId: string,
    entityId: string,
    recommendationType: RecommendationType,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    const docs = await this.prisma.adOptimizationRecommendation.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
    });

    return (
      docs
        .map((doc) => this.toDocument(doc))
        .find(
          (doc) =>
            doc.entityId === entityId &&
            doc.recommendationType === recommendationType &&
            doc.status === 'pending',
        ) ?? null
    );
  }

  private async updateStatus(
    id: string,
    organizationId: string,
    status: RecommendationStatus,
    expectedCurrentStatus: RecommendationStatus,
  ): Promise<AdOptimizationRecommendationDocument | null> {
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

      const existingDoc = this.toDocument(existing);
      if (existingDoc.status !== expectedCurrentStatus) {
        throw new ConflictException(
          `Cannot transition recommendation ${id} to '${status}': expected status '${expectedCurrentStatus}' but found '${existingDoc.status ?? 'unknown'}'`,
        );
      }

      const doc = await this.prisma.adOptimizationRecommendation.update({
        data: {
          data: this.toRecommendationData({
            ...existingDoc,
            status,
          }) as never,
        },
        where: { id },
      });

      this.logger.log(`${caller} updated recommendation ${id} to ${status}`);
      return this.toDocument(doc);
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  private toCreateManyInput(
    recommendation: Partial<AdOptimizationRecommendationDocument>,
  ): Record<string, unknown> {
    return {
      data: this.toRecommendationData(recommendation) as never,
      organizationId: this.asString(recommendation.organization) ?? '',
    };
  }

  private toDocument(
    doc: PrismaAdOptimizationRecommendation,
  ): AdOptimizationRecommendationDocument {
    const data = this.asRecord(doc.data);
    const metrics = this.asRecord(data.metrics);
    const suggestedAction = this.asRecord(data.suggestedAction);

    return {
      ...doc,
      _id: doc.mongoId ?? doc.id,
      data,
      entityId: this.asString(data.entityId),
      entityName: this.asString(data.entityName),
      entityType: this.asString(data.entityType),
      expiresAt:
        data.expiresAt instanceof Date || typeof data.expiresAt === 'string'
          ? data.expiresAt
          : undefined,
      metrics,
      organization: doc.organizationId,
      reason: this.asString(data.reason),
      recommendationType: this.asString(data.recommendationType),
      runDate:
        data.runDate instanceof Date || typeof data.runDate === 'string'
          ? data.runDate
          : undefined,
      runId: this.asString(data.runId),
      status: this.asString(data.status),
      suggestedAction,
    };
  }

  private toRecommendationData(
    recommendation: Partial<AdOptimizationRecommendationDocument>,
  ): Record<string, unknown> {
    const existingData = this.asRecord(recommendation.data);

    return {
      ...existingData,
      ...(recommendation.entityId ? { entityId: recommendation.entityId } : {}),
      ...(recommendation.entityName
        ? { entityName: recommendation.entityName }
        : {}),
      ...(recommendation.entityType
        ? { entityType: recommendation.entityType }
        : {}),
      ...(recommendation.expiresAt
        ? { expiresAt: recommendation.expiresAt }
        : {}),
      ...(recommendation.metrics ? { metrics: recommendation.metrics } : {}),
      ...(recommendation.reason ? { reason: recommendation.reason } : {}),
      ...(recommendation.recommendationType
        ? { recommendationType: recommendation.recommendationType }
        : {}),
      ...(recommendation.runDate ? { runDate: recommendation.runDate } : {}),
      ...(recommendation.runId ? { runId: recommendation.runId } : {}),
      ...(recommendation.status ? { status: recommendation.status } : {}),
      ...(recommendation.suggestedAction
        ? { suggestedAction: recommendation.suggestedAction }
        : {}),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
