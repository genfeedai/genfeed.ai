import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import {
  type AgentStrategyOpportunitySourceType,
  type AgentStrategyOpportunityStatus,
  CONVERSATION_OPPORTUNITY_SOURCE_TYPE,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '@api/helpers/utils/paginated-result/paginated-result.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
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

/** Statuses that still await execution; the autopilot and the list endpoint both read these. */
const OPEN_OPPORTUNITY_STATUSES: AgentStrategyOpportunityStatus[] = [
  'approved',
  'generating',
  'held',
  'queued',
  'revising',
];

@Traced()
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
    // The promoted columns are copies of `data` keys for filtering; the
    // document reads every field from `data`, so a key `data` lacks stays absent.
    const {
      priorityScore: _priorityScore,
      sourceRef: _sourceRef,
      sourceType: _sourceType,
      status: _status,
      topic: _topic,
      ...columns
    } = record;

    return {
      ...(columns as unknown as AgentStrategyOpportunityDocument),
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
      /** Read the conversation queue instead of the autopilot's opportunities. */
      isConversationQueue?: boolean;
      includeDeleted?: boolean;
      statuses?: AgentStrategyOpportunityStatus[];
    } = {},
  ): Promise<AgentStrategyOpportunityDocument[]> {
    // tenant-scope-ignore: organizationId is pinned below; isDeleted is omitted only when the caller explicitly requests tombstones
    const records = await this.prisma.agentStrategyOpportunity.findMany({
      where: {
        organizationId,
        strategyId,
        ...(options.includeDeleted ? {} : { isDeleted: false }),
        ...(options.statuses?.length
          ? { status: { in: options.statuses } }
          : {}),
        ...(options.isConversationQueue
          ? { sourceType: CONVERSATION_OPPORTUNITY_SOURCE_TYPE }
          : {
              OR: [
                { sourceType: null },
                { sourceType: { not: CONVERSATION_OPPORTUNITY_SOURCE_TYPE } },
              ],
            }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records
      .map((record) =>
        this.normalizeOpportunity(record as unknown as Record<string, unknown>),
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
      statuses: OPEN_OPPORTUNITY_STATUSES,
    });
  }

  /**
   * One page of the strategy's open opportunities, highest `priorityScore`
   * first (newest, then id, break ties). A missing or non-numeric score is a
   * NULL column and ranks as 0, matching the autopilot's in-memory ordering;
   * Prisma cannot `orderBy` a COALESCE, so the page of ids is ranked and
   * windowed in SQL (`LIMIT`/`OFFSET`) and only that page of rows is hydrated.
   */
  async listOpenPageByStrategy(
    strategyId: string,
    organizationId: string,
    paging: { limit: number; page: number },
  ): Promise<PaginatedResult<AgentStrategyOpportunityDocument>> {
    const { limit, page } = paging;

    const [rankedIds, totalDocs] = await Promise.all([
      // sql-risk-audit: ignore raw-sql-review -- Tenant, strategy and soft-delete filters are in the WHERE clause, the read is bounded by LIMIT, and Prisma cannot ORDER BY a COALESCE.
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "agent_strategy_opportunities"
        WHERE "organizationId" = ${organizationId}
          AND "strategyId" = ${strategyId}
          AND "isDeleted" = false
          AND "status" = ANY(${OPEN_OPPORTUNITY_STATUSES}::text[])
          AND "sourceType" IS DISTINCT FROM ${CONVERSATION_OPPORTUNITY_SOURCE_TYPE}
        ORDER BY
          COALESCE("priorityScore", 0) DESC,
          "createdAt" DESC,
          "id" ASC
        LIMIT ${limit}
        OFFSET ${(page - 1) * limit}
      `),
      this.prisma.agentStrategyOpportunity.count({
        where: scopedWhere(organizationId, {
          AND: [
            {
              OR: [
                { sourceType: null },
                { sourceType: { not: CONVERSATION_OPPORTUNITY_SOURCE_TYPE } },
              ],
            },
          ],
          status: { in: OPEN_OPPORTUNITY_STATUSES },
          strategyId,
        }),
      }),
    ]);

    const ids = rankedIds.map((row) => row.id);
    const records = ids.length
      ? await this.prisma.agentStrategyOpportunity.findMany({
          take: ids.length,
          where: scopedWhere(organizationId, { id: { in: ids } }),
        })
      : [];
    const positionById = new Map(ids.map((id, index) => [id, index]));

    return buildPaginatedResult(
      records
        .sort(
          (left, right) =>
            (positionById.get(left.id) ?? 0) -
            (positionById.get(right.id) ?? 0),
        )
        .map((record) =>
          this.normalizeOpportunity(
            record as unknown as Record<string, unknown>,
          ),
        ),
      totalDocs,
      page,
      limit,
    );
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AgentStrategyOpportunityDocument | null> {
    const record = await this.prisma.agentStrategyOpportunity.findFirst({
      where: scopedWhere(organizationId, { id }),
    });

    return record
      ? this.normalizeOpportunity(record as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * Moves an opportunity to `status` only while it is still in one of the
   * `from` statuses. The write is guarded on the status it read, so two callers
   * racing for the same transition cannot both win; the loser gets `null`.
   */
  async transitionStatus(
    id: string,
    organizationId: string,
    from: AgentStrategyOpportunityStatus[],
    status: AgentStrategyOpportunityStatus,
    patch: Record<string, unknown> = {},
  ): Promise<AgentStrategyOpportunityDocument | null> {
    const existing = await this.prisma.agentStrategyOpportunity.findFirst({
      where: scopedWhere(organizationId, { id }),
      select: { data: true },
    });
    if (
      !existing ||
      !this.isPlainObject(existing.data) ||
      !from.includes(existing.data.status as AgentStrategyOpportunityStatus)
    ) {
      return null;
    }

    const currentStatus = existing.data.status as string;
    const result = await this.prisma.agentStrategyOpportunity.updateMany({
      where: scopedWhere(organizationId, { id, status: currentStatus }),
      data: {
        data: this.toJsonValue({ ...existing.data, ...patch, status }),
      },
    });
    return result.count === 1 ? this.findById(id, organizationId) : null;
  }

  async createIfMissing(
    input: CreateOpportunityInput,
  ): Promise<AgentStrategyOpportunityDocument> {
    return this.prisma.$transaction(async (transaction) => {
      const key = JSON.stringify([
        'agent-strategy-opportunity',
        input.organizationId,
        input.strategyId,
        input.sourceType,
        input.topic,
      ]);
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const existing = await transaction.agentStrategyOpportunity.findFirst({
        where: scopedWhere(input.organizationId, {
          sourceType: input.sourceType,
          topic: input.topic,
          ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
          strategyId: input.strategyId,
        }),
      });
      if (existing) {
        return this.normalizeOpportunity(
          existing as unknown as Record<string, unknown>,
        );
      }

      const { brandId, organizationId, strategyId, ...data } = input;
      const created = await transaction.agentStrategyOpportunity.create({
        data: {
          brandId: typeof brandId === 'string' ? brandId : null,
          data: this.toJsonValue({
            ...data,
            status: 'queued',
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
    });
  }

  async claimForGeneration(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.agentStrategyOpportunity.findFirst({
      where: scopedWhere(organizationId, { id }),
      select: { data: true },
    });
    if (
      !existing ||
      !this.isPlainObject(existing.data) ||
      existing.data.status !== 'queued'
    )
      return false;
    const result = await this.prisma.agentStrategyOpportunity.updateMany({
      where: scopedWhere(organizationId, { id, status: 'queued' }),
      data: {
        data: this.toJsonValue({ ...existing.data, status: 'generating' }),
      },
    });
    return result.count === 1;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: AgentStrategyOpportunityStatus,
    patch: Record<string, unknown> = {},
  ): Promise<AgentStrategyOpportunityDocument | null> {
    const existing = await this.prisma.agentStrategyOpportunity.findFirst({
      where: scopedWhere(organizationId, { id }),
      select: { data: true },
    });

    if (!existing) {
      return null;
    }

    const existingData = this.isPlainObject(existing.data) ? existing.data : {};
    const updated = await this.prisma.agentStrategyOpportunity.update({
      where: scopedWhere(organizationId, { id }),
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
      if (
        Array.isArray(opportunity.metadata?.postIds) &&
        opportunity.metadata.postIds.length > 0
      )
        return false;
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
