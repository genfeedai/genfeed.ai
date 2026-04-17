import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import type { AgentSessionBindingDocument } from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentSessionBindingStatus } from '@api/services/agent-threading/types/agent-thread.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';

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
    _id: snapshot.id as string,
    organizationId: snapshot.organizationId as string,
    threadId: snapshot.threadId as string,
    organization: snapshot.organizationId as string,
    thread: snapshot.threadId as string,
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

  upsertBindingEffect(
    params: UpsertRuntimeSessionBindingParams,
  ): Effect.Effect<AgentSessionBindingDocument | null, unknown> {
    const nowIso = new Date().toISOString();

    return fromPromiseEffect(async () => {
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
        where: {
          isDeleted: false,
          organizationId: params.organizationId,
          threadId: params.threadId,
        },
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
          data: { data: updatedData, updatedAt: new Date() },
        })) as unknown as Record<string, unknown>;
      } else {
        snapshot = (await this.prisma.agentThreadSnapshot.create({
          data: {
            organizationId: params.organizationId,
            threadId: params.threadId,
            data: { sessionBinding: sessionBindingPatch },
            isDeleted: false,
          },
        })) as unknown as Record<string, unknown>;
      }

      return toSessionBindingDocument(snapshot);
    });
  }

  async upsertBinding(
    params: UpsertRuntimeSessionBindingParams,
  ): Promise<AgentSessionBindingDocument | null> {
    return runEffectPromise(this.upsertBindingEffect(params));
  }

  getBindingEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<AgentSessionBindingDocument | null, unknown> {
    return fromPromiseEffect(async () => {
      const snapshot = await this.prisma.agentThreadSnapshot.findFirst({
        where: {
          isDeleted: false,
          organizationId,
          threadId,
        },
      });

      return toSessionBindingDocument(
        snapshot as unknown as Record<string, unknown> | null,
      );
    });
  }

  async getBinding(
    threadId: string,
    organizationId: string,
  ): Promise<AgentSessionBindingDocument | null> {
    return runEffectPromise(this.getBindingEffect(threadId, organizationId));
  }

  markCancelledEffect(
    threadId: string,
    organizationId: string,
    runId?: string,
  ): Effect.Effect<void, unknown> {
    return this.upsertBindingEffect({
      organizationId,
      runId,
      status: 'cancelled',
      threadId,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          this.loggerService.warn('Agent runtime session marked cancelled', {
            organizationId,
            runId,
            threadId,
          });
        }),
      ),
      Effect.asVoid,
    );
  }

  async markCancelled(
    threadId: string,
    organizationId: string,
    runId?: string,
  ): Promise<void> {
    await runEffectPromise(
      this.markCancelledEffect(threadId, organizationId, runId),
    );
  }
}
