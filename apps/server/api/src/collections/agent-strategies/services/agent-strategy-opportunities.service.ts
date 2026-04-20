import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type {
  AgentStrategyOpportunitySourceType,
  AgentStrategyOpportunityStatus,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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

  listByStrategy(
    strategyId: string,
    organizationId: string,
    options: {
      includeDeleted?: boolean;
      statuses?: AgentStrategyOpportunityStatus[];
    } = {},
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const where: Record<string, unknown> = {
      organizationId,
      strategyId,
      ...(options.includeDeleted ? {} : { isDeleted: false }),
    };

    if (options.statuses?.length) {
      where.status = { in: options.statuses };
    }

    return this.prisma.agentStrategyOpportunity.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { priorityScore: 'desc' }],
    }) as Promise<AgentStrategyOpportunityDocument[]>;
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
    const dedupeWhere: Record<string, unknown> = {
      isDeleted: false,
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      strategyId: input.strategyId,
      topic: input.topic,
    };

    if (input.sourceRef) {
      dedupeWhere.sourceRef = input.sourceRef;
    }

    const existing = await this.prisma.agentStrategyOpportunity.findFirst({
      where: dedupeWhere,
    });
    if (existing) {
      return existing as AgentStrategyOpportunityDocument;
    }

    const created = await this.prisma.agentStrategyOpportunity.create({
      data: {
        ...input,
        formatCandidates: input.formatCandidates,
        isDeleted: false,
        metadata: input.metadata ?? {},
        platformCandidates: input.platformCandidates,
      },
    });

    this.logger.log('Created agent strategy opportunity', {
      opportunityId: created.id,
      sourceType: input.sourceType,
      strategyId: input.strategyId,
      topic: input.topic,
    });

    return created as AgentStrategyOpportunityDocument;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: AgentStrategyOpportunityStatus,
    patch: Record<string, unknown> = {},
  ): Promise<AgentStrategyOpportunityDocument | null> {
    return this.prisma.agentStrategyOpportunity.update({
      where: { id, isDeleted: false, organizationId },
      data: {
        ...patch,
        status,
      },
    }) as Promise<AgentStrategyOpportunityDocument | null>;
  }

  async expireStaleOpportunities(
    strategy: AgentStrategyDocument,
  ): Promise<number> {
    const result = await this.prisma.agentStrategyOpportunity.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        isDeleted: false,
        organizationId: strategy.organizationId,
        status: {
          in: ['approved', 'generating', 'held', 'queued', 'revising'],
        },
        strategyId: strategy.id,
      },
      data: {
        decisionReason: 'Opportunity expired before execution.',
        status: 'expired',
      },
    });

    return result.count;
  }
}
