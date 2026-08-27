import type { AgentPublishAuditsQueryDto } from '@api/collections/agent-publish-audits/dto/agent-publish-audits-query.dto';
import type {
  AgentPublishAuditDocument,
  AgentPublishAuditScope,
  CreateAgentPublishAuditInput,
} from '@api/collections/agent-publish-audits/schemas/agent-publish-audit.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentPublishDecision } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { BadRequestException, Injectable } from '@nestjs/common';

type StoredAgentPublishAuditRow = {
  agentRunId: string | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  autonomyMode: string;
  brandId: string | null;
  channel: string | null;
  createdAt: Date;
  decision: AgentPublishDecision;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  policyName: string;
  postGroupId: string | null;
  reason: string;
  updatedAt: Date;
  userId: string;
};

@Injectable()
export class AgentPublishAuditsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAudit(
    input: CreateAgentPublishAuditInput,
  ): Promise<AgentPublishAuditDocument> {
    const created = await this.delegate().create({
      data: {
        agentRunId: input.agentRunId ?? null,
        agentStrategyId: input.agentStrategyId ?? null,
        agentThreadId: input.agentThreadId ?? null,
        autonomyMode: input.autonomyMode,
        brandId: input.brandId ?? null,
        channel: input.channel ?? null,
        decision: input.decision,
        organizationId: input.organizationId,
        policyName: input.policyName,
        postGroupId: input.postGroupId ?? null,
        reason: input.reason,
        userId: input.userId,
      },
    });
    return this.toDocument(created);
  }

  async findAllScoped(
    context: AgentPublishAuditScope,
    query: AgentPublishAuditsQueryDto,
  ) {
    if (!context.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const where = scopedWhere(context.organizationId, {
      ...(query.agentRunId ? { agentRunId: query.agentRunId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.postGroupId ? { postGroupId: query.postGroupId } : {}),
    });
    const [docs, total] = await Promise.all([
      this.delegate().findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.delegate().count({ where }),
    ]);

    return {
      docs: docs.map((row) => this.toDocument(row)),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  private toDocument(
    row: StoredAgentPublishAuditRow,
  ): AgentPublishAuditDocument {
    return {
      agentRunId: row.agentRunId,
      agentStrategyId: row.agentStrategyId,
      agentThreadId: row.agentThreadId,
      autonomyMode: row.autonomyMode,
      brandId: row.brandId,
      channel: row.channel,
      createdAt: row.createdAt,
      decision: row.decision,
      id: row.id,
      isDeleted: row.isDeleted,
      organizationId: row.organizationId,
      policyName: row.policyName,
      postGroupId: row.postGroupId,
      reason: row.reason,
      updatedAt: row.updatedAt,
      userId: row.userId,
    };
  }

  private delegate() {
    return this.prisma.agentPublishAudit;
  }
}
