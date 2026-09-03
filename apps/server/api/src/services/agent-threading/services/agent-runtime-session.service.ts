import { scopedWhere } from '@api/index';
import type { AgentSessionBindingDocument } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentSessionBindingStatus } from '@api/services/agent-threading/types/agent-thread.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface UpsertRuntimeSessionBindingParams {
  threadId: string;
  organizationId: string;
  runId?: string;
  model?: string;
  status: AgentSessionBindingStatus;
  resumeCursor?: Record<string, unknown>;
  activeCommandId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Adapts a raw Prisma AgentThreadSnapshot row into the shape expected by callers
 * that previously consumed AgentSessionBindingDocument.
 *
 * AgentSessionBinding data is stored in AgentThreadSnapshot.data.sessionBinding Json field.
 */
function toSessionBindingDocument(
  snapshot: Record<string, unknown> | null | undefined,
): AgentSessionBindingDocument | null {
  if (!snapshot) return null;
  const data = (snapshot.data as Record<string, unknown>) ?? {};
  const sb = (data.sessionBinding as Record<string, unknown>) ?? {};
  return {
    id: snapshot.id as string,
    organizationId: snapshot.organizationId as string,
    threadId: snapshot.threadId as string,
    runId: sb.runId as string | undefined,
    model: sb.model as string | undefined,
    status: (sb.status as AgentSessionBindingStatus) ?? 'idle',
    resumeCursor: sb.resumeCursor as Record<string, unknown> | undefined,
    activeCommandId: sb.activeCommandId as string | undefined,
    lastSeenAt: sb.lastSeenAt as string | undefined,
    metadata: sb.metadata as Record<string, unknown> | undefined,
    isDeleted: false,
  } as unknown as AgentSessionBindingDocument;
}

@Injectable()
export class AgentRuntimeSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  async upsertBinding(
    params: UpsertRuntimeSessionBindingParams,
  ): Promise<AgentSessionBindingDocument | null> {
    const nowIso = new Date().toISOString();

    // Session binding is stored inside AgentThreadSnapshot.data.sessionBinding
    const sessionBindingPatch: Record<string, unknown> = {
      lastSeenAt: nowIso,
      status: params.status,
    };
    if (params.activeCommandId) {
      sessionBindingPatch.activeCommandId = params.activeCommandId;
    }
    if (params.metadata) {
      sessionBindingPatch.metadata = params.metadata;
    }
    if (params.model) {
      sessionBindingPatch.model = params.model;
    }
    if (params.resumeCursor) {
      sessionBindingPatch.resumeCursor = params.resumeCursor;
    }
    if (params.runId) {
      sessionBindingPatch.runId = params.runId;
    }

    const existing = await this.prisma.agentThreadSnapshot.findFirst({
      where: scopedWhere(params.organizationId, {
        threadId: params.threadId,
      }),
    });

    let snapshot: Record<string, unknown> | null = null;

    if (existing) {
      const existingData = (existing.data as Record<string, unknown>) ?? {};
      const updatedData = {
        ...existingData,
        sessionBinding: {
          ...((existingData.sessionBinding as Record<string, unknown>) ?? {}),
          ...sessionBindingPatch,
        },
      };

      snapshot = (await this.prisma.agentThreadSnapshot.update({
        where: { id: existing.id },
        data: { data: this.toJsonValue(updatedData), updatedAt: new Date() },
      })) as unknown as Record<string, unknown>;
    } else {
      snapshot = (await this.prisma.agentThreadSnapshot.create({
        data: {
          data: this.toJsonValue({ sessionBinding: sessionBindingPatch }),
          isDeleted: false,
          organizationId: params.organizationId,
          threadId: params.threadId,
        },
      })) as unknown as Record<string, unknown>;
    }

    return toSessionBindingDocument(snapshot);
  }

  async getBinding(
    threadId: string,
    organizationId: string,
  ): Promise<AgentSessionBindingDocument | null> {
    const snapshot = await this.prisma.agentThreadSnapshot.findFirst({
      where: scopedWhere(organizationId, { threadId }),
    });

    return toSessionBindingDocument(
      snapshot as unknown as Record<string, unknown> | null,
    );
  }

  async markCancelled(
    threadId: string,
    organizationId: string,
    runId?: string,
  ): Promise<void> {
    await this.upsertBinding({
      organizationId,
      runId,
      status: 'cancelled',
      threadId,
    });

    this.loggerService.warn('Agent runtime session marked cancelled', {
      organizationId,
      runId,
      threadId,
    });
  }
}

/**
 * Null-safe get when `AgentRuntimeSessionService` is `@Optional()`-injected.
 * Returns `null` when the service is absent so orchestrator callers do not
 * each re-implement the same guard.
 */
export async function getRuntimeBinding(
  service: AgentRuntimeSessionService | undefined,
  threadId: string,
  organizationId: string,
): Promise<AgentSessionBindingDocument | null> {
  if (!service) {
    return null;
  }

  return service.getBinding(threadId, organizationId);
}

/**
 * Null-safe upsert when `AgentRuntimeSessionService` is `@Optional()`-injected.
 * No-ops (void) when the service is absent.
 */
export async function upsertRuntimeBinding(
  service: AgentRuntimeSessionService | undefined,
  params: UpsertRuntimeSessionBindingParams,
): Promise<void> {
  if (!service) {
    return;
  }

  await service.upsertBinding(params);
}
