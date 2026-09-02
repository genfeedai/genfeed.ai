import type {
  AdOptimizationRecommendationDocument,
  RecommendationReviewStatus,
  RecommendationStatus,
  RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type Prisma,
  type AdOptimizationRecommendation as PrismaAdOptimizationRecommendation,
  toPrismaJson,
} from '@genfeedai/prisma';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { ConflictException, Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AdOptimizationRecommendationsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'adOptimizationRecommendation'>,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async createBatch(
    recommendations: Partial<AdOptimizationRecommendationDocument>[],
  ): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.prisma.adOptimizationRecommendation.createMany({
        data: recommendations.map((recommendation) =>
          this.toCreateManyInput(recommendation),
        ),
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
    const dataFilters: Prisma.AdOptimizationRecommendationWhereInput[] = [];
    if (params?.status) {
      dataFilters.push({ data: { equals: params.status, path: ['status'] } });
    }
    if (params?.recommendationType) {
      dataFilters.push({
        data: {
          equals: params.recommendationType,
          path: ['recommendationType'],
        },
      });
    }

    const docs = await this.prisma.adOptimizationRecommendation.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.offset ?? 0,
      take: params?.limit ?? 50,
      where: scopedWhere(
        organizationId,
        dataFilters.length > 0 ? { AND: dataFilters } : {},
      ),
    });

    return docs.map((doc) => this.toDocument(doc));
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    const doc = await this.prisma.adOptimizationRecommendation.findFirst({
      where: scopedWhere(organizationId, { id }),
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
    reason?: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'rejected', 'pending', {
      reason,
    });
  }

  async markExecuted(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'executed', 'approved');
  }

  /**
   * Generic patch entrypoint for the recommendation review flow.
   * Keyed on `status`: 'approved' | 'rejected'. Server-side guard still
   * enforces the recommendation must currently be 'pending' — mirrors the
   * approve()/reject() expectedCurrentStatus check.
   */
  async patchReviewStatus(
    id: string,
    organizationId: string,
    status: RecommendationReviewStatus,
    reason?: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    if (status === 'approved') {
      return this.approve(id, organizationId);
    }

    return this.reject(id, organizationId, reason);
  }

  async expireStale(): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const now = new Date();
      // tenant-scope-ignore: platform maintenance sweep intentionally finds stale recommendations across organizations; each mutation below is scoped by the row's organizationId
      const docs = await this.prisma.adOptimizationRecommendation.findMany({
        where: {
          AND: [
            { data: { equals: 'pending', path: ['status'] } },
            { data: { lt: now.toISOString(), path: ['expiresAt'] } },
          ],
          isDeleted: false,
        },
      });

      let count = 0;
      for (const doc of docs.map((item) => this.toDocument(item))) {
        await this.updateStatus(
          doc.id,
          doc.organizationId,
          'expired',
          'pending',
        );
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
    const doc = await this.prisma.adOptimizationRecommendation.findFirst({
      where: scopedWhere(organizationId, {
        AND: [
          { data: { equals: entityId, path: ['entityId'] } },
          {
            data: {
              equals: recommendationType,
              path: ['recommendationType'],
            },
          },
          { data: { equals: 'pending', path: ['status'] } },
        ],
      }),
    });

    return doc ? this.toDocument(doc) : null;
  }

  private async updateStatus(
    id: string,
    organizationId: string,
    status: RecommendationStatus,
    expectedCurrentStatus: RecommendationStatus,
    options?: { reason?: string },
  ): Promise<AdOptimizationRecommendationDocument | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const existing = await this.prisma.adOptimizationRecommendation.findFirst(
        {
          where: scopedWhere(organizationId, { id }),
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
          data: toPrismaJson(
            this.toRecommendationData({
              ...existingDoc,
              status,
              ...(options?.reason ? { reason: options.reason } : {}),
            }),
          ),
        },
        where: scopedWhere(organizationId, { id }),
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
  ): Prisma.AdOptimizationRecommendationCreateManyInput {
    const organizationId = this.asString(recommendation.organizationId);
    if (!organizationId) {
      throw new Error(
        'Ad optimization recommendation organizationId is required',
      );
    }

    return {
      data: toPrismaJson(this.toRecommendationData(recommendation)),
      organizationId,
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
      data,
      entityId: this.asString(data.entityId),
      entityName: this.asString(data.entityName),
      entityType: this.asString(data.entityType),
      expiresAt:
        data.expiresAt instanceof Date || typeof data.expiresAt === 'string'
          ? data.expiresAt
          : undefined,
      metrics,
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
