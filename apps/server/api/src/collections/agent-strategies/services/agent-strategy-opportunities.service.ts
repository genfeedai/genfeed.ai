import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  AgentStrategyOpportunity,
  type AgentStrategyOpportunityDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type {
  AgentStrategyOpportunitySourceType,
  AgentStrategyOpportunityStatus,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

type CreateOpportunityInput = {
  strategy: Types.ObjectId;
  organization: Types.ObjectId;
  brand?: Types.ObjectId;
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
    @InjectModel(AgentStrategyOpportunity.name, DB_CONNECTIONS.AGENT)
    private readonly model: AggregatePaginateModel<AgentStrategyOpportunityDocument>,
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
    const query: Record<string, unknown> = {
      organization: new Types.ObjectId(organizationId),
      strategy: new Types.ObjectId(strategyId),
      ...(options.includeDeleted ? {} : { isDeleted: false }),
    };

    if (options.statuses?.length) {
      query.status = { $in: options.statuses };
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1, priorityScore: -1 })
      .exec();
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
    const dedupeQuery: Record<string, unknown> = {
      isDeleted: false,
      organization: input.organization,
      sourceType: input.sourceType,
      strategy: input.strategy,
      topic: input.topic,
    };

    if (input.sourceRef) {
      dedupeQuery.sourceRef = input.sourceRef;
    }

    const existing = await this.model.findOne(dedupeQuery).exec();
    if (existing) {
      return existing;
    }

    const created = await this.model.create({
      ...input,
      formatCandidates: input.formatCandidates,
      metadata: input.metadata ?? {},
      platformCandidates: input.platformCandidates,
    });

    this.logger.log('Created agent strategy opportunity', {
      opportunityId: String(created._id),
      sourceType: input.sourceType,
      strategyId: String(input.strategy),
      topic: input.topic,
    });

    return created;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: AgentStrategyOpportunityStatus,
    patch: Partial<AgentStrategyOpportunity> = {},
  ): Promise<AgentStrategyOpportunityDocument | null> {
    const filter = {
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
    const update = {
      $set: {
        ...patch,
        status,
      },
    };

    return this.model
      .findOneAndUpdate(filter as never, update as never, { new: true })
      .exec() as Promise<AgentStrategyOpportunityDocument | null>;
  }

  async expireStaleOpportunities(
    strategy: AgentStrategyDocument,
  ): Promise<number> {
    const result = await this.model.updateMany(
      {
        expiresAt: { $lte: new Date() },
        isDeleted: false,
        organization: strategy.organization,
        status: {
          $in: ['approved', 'generating', 'held', 'queued', 'revising'],
        },
        strategy: strategy._id,
      },
      {
        $set: {
          decisionReason: 'Opportunity expired before execution.',
          status: 'expired',
        },
      },
    );

    return result.modifiedCount;
  }
}
