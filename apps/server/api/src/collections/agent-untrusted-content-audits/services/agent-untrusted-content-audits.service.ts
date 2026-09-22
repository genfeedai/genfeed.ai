import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type CreateAgentUntrustedContentAuditInput,
  type IAgentUntrustedContentAuditDocument,
  parseAgentUntrustedContentGateOutcome,
  parseAgentUntrustedContentSource,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

type StoredAgentUntrustedContentAuditRow = {
  agentStrategyId: string | null;
  agentThreadId: string | null;
  brandId: string | null;
  confidence: number;
  contentLength: number;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  minConfidence: number;
  mode: string;
  organizationId: string;
  outcome: string;
  source: string;
  toolName: string;
  updatedAt: Date;
  userId: string;
  workflowExecutionId: string | null;
};

/**
 * Audit trail for the untrusted-content injection gate (#4870).
 *
 * One row per tool result the gate flagged at or above its threshold —
 * `withheld` in live mode, `shadow_flagged` in shadow mode. Shadow rows are
 * how the false-positive rate on real tool traffic is sized before anything
 * is ever withheld, so they carry the tool and the source, never the content.
 */
@Injectable()
export class AgentUntrustedContentAuditsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAudit(
    input: CreateAgentUntrustedContentAuditInput,
  ): Promise<IAgentUntrustedContentAuditDocument> {
    const created = await this.delegate().create({
      data: {
        agentStrategyId: input.agentStrategyId ?? null,
        agentThreadId: input.agentThreadId ?? null,
        brandId: input.brandId ?? null,
        confidence: input.confidence,
        contentLength: input.contentLength,
        minConfidence: input.minConfidence,
        mode: input.mode,
        organizationId: input.organizationId,
        outcome: input.outcome,
        source: input.source,
        toolName: input.toolName,
        userId: input.userId,
        workflowExecutionId: input.workflowExecutionId ?? null,
      },
    });

    return this.toDocument(created);
  }

  private toDocument(
    row: StoredAgentUntrustedContentAuditRow,
  ): IAgentUntrustedContentAuditDocument {
    return {
      agentStrategyId: row.agentStrategyId,
      agentThreadId: row.agentThreadId,
      brandId: row.brandId,
      confidence: row.confidence,
      contentLength: row.contentLength,
      createdAt: row.createdAt,
      id: row.id,
      isDeleted: row.isDeleted,
      minConfidence: row.minConfidence,
      mode: row.mode,
      organizationId: row.organizationId,
      outcome: parseAgentUntrustedContentGateOutcome(row.outcome),
      source: parseAgentUntrustedContentSource(row.source),
      toolName: row.toolName,
      updatedAt: row.updatedAt,
      userId: row.userId,
      workflowExecutionId: row.workflowExecutionId,
    };
  }

  private delegate() {
    return this.prisma.agentUntrustedContentAudit;
  }
}
