import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type {
  AgentStrategyOpportunitySourceType,
  AgentStrategyOpportunityStatus,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CreateOpportunityInput = {
  strategyId: string;
  organizationId: string;
  brandId?: string;
  sourceType: AgentStrategyOpportunitySourceType;
  sourceRef?: string;
  topic: string;
  platformCandidates: string[];
  formatCandidates: string[];
  relevanceScore: number;
  expectedTrafficScore: number;
  estimatedCreditCost: number;
  priorityScore: number;
  expiresAt?: Date;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AgentStrategyOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private normalizeOpportunity(
    record: Record<string, unknown>,
  ): AgentStrategyOpportunityDocument {
    const data = this.isPlainObject(record.data) ? record.data : {};

    return {
      ...(record as unknown as AgentStrategyOpportunityDocument),
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
      brand:
        typeof record.brandId === 'string' || record.brandId === null
          ? (record.brandId as string | null)
          : undefined,
      organization:
        typeof record.organizationId === 'string' ? record.organizationId : '',
      strategy:
        typeof record.strategyId === 'string' ? record.strategyId : undefined,
      ...(data as Partial<AgentStrategyOpportunityDocument>),
    };
  }

  private getExpiresAtTimestamp(
    opportunity: AgentStrategyOpportunityDocument,
  ): number | null {
    if (!opportunity.expiresAt) {
      return null;
    }

    const expiresAt =
      opportunity.expiresAt instanceof Date
        ? opportunity.expiresAt
        : new Date(opportunity.expiresAt);

    return Number.isNaN(expiresAt.getTime()) ? null : expiresAt.getTime();
  }

  async listByStrategy(
    strategyId: string,
    organizationId: string,
    options: {
      includeDeleted?: boolean;
      statuses?: AgentStrategyOpportunityStatus[];
    } = {},
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const records = await this.prisma.agentStrategyOpportunity.findMany({
      where: {
        organizationId,
        strategyId,
        ...(options.includeDeleted ? {} : { isDeleted: false }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records
      .map((record) =>
        this.normalizeOpportunity(record as unknown as Record<string, unknown>),
      )
      .filter(
        (record) =>
          !options.statuses?.length ||
          options.statuses.includes(
            record.status as AgentStrategyOpportunityStatus,
          ),
      )
      .sort((left, right) => {
        const priorityDelta =
          (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
        return (
          priorityDelta || right.createdAt.getTime() - left.createdAt.getTime()
        );
      });
  }

  listOpenByStrategy(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyOpportunityDocument[]> {
    return this.listByStrategy(strategyId, organizationId, {
      statuses: ['approved', 'generating', 'held', 'queued', 'revising'],
    });
  }

  async createIfMissing(
    input: CreateOpportunityInput,
  ): Promise<AgentStrategyOpportunityDocument> {
    const records = await this.prisma.agentStrategyOpportunity.findMany({
      where: {
        isDeleted: false,
        organizationId: input.organizationId,
        strategyId: input.strategyId,
      },
    });
    const existing = records
      .map((record) =>
        this.normalizeOpportunity(record as unknown as Record<string, unknown>),
      )
      .find(
        (record) =>
          record.sourceType === input.sourceType &&
          record.topic === input.topic &&
          (!input.sourceRef || record.sourceRef === input.sourceRef),
      );
    if (existing) {
      return existing;
    }

    const { brandId, organizationId, strategyId, ...data } = input;
    const created = await this.prisma.agentStrategyOpportunity.create({
      data: {
        brandId: typeof brandId === 'string' ? brandId : null,
        data: this.toJsonValue({
          ...data,
          metadata: input.metadata ?? {},
        }),
        isDeleted: false,
        organizationId,
        strategyId,
      },
    });

    this.logger.log('Created agent strategy opportunity', {
      opportunityId: created.id,
      sourceType: input.sourceType,
      strategyId: input.strategyId,
      topic: input.topic,
    });

    return this.normalizeOpportunity(
      created as unknown as Record<string, unknown>,
    );
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: AgentStrategyOpportunityStatus,
    patch: Record<string, unknown> = {},
  ): Promise<AgentStrategyOpportunityDocument | null> {
    const existing = await this.prisma.agentStrategyOpportunity.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      return null;
    }

    const existingData = this.isPlainObject(existing.data) ? existing.data : {};
    const updated = await this.prisma.agentStrategyOpportunity.update({
      where: { id, isDeleted: false, organizationId },
      data: {
        data: this.toJsonValue({
          ...existingData,
          ...patch,
          status,
        }),
      },
    });

    return this.normalizeOpportunity(
      updated as unknown as Record<string, unknown>,
    );
  }

  async expireStaleOpportunities(
    strategy: AgentStrategyDocument,
  ): Promise<number> {
    const openOpportunities = await this.listOpenByStrategy(
      strategy.id,
      strategy.organizationId,
    );
    const stale = openOpportunities.filter((opportunity) => {
      const expiresAt = this.getExpiresAtTimestamp(opportunity);
      return expiresAt !== null && expiresAt <= Date.now();
    });

    await Promise.all(
      stale.map((opportunity) =>
        this.updateStatus(opportunity.id, strategy.organizationId, 'expired', {
          decisionReason: 'Opportunity expired before execution.',
        }),
      ),
    );

    return stale.length;
  }
}
