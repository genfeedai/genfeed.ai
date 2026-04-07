import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import {
  AgentSessionBinding,
  type AgentSessionBindingDocument,
} from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import { AgentSessionBindingStatus } from '@api/services/agent-threading/types/agent-thread.types';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Effect } from 'effect';
import { type Model, Types } from 'mongoose';

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

@Injectable()
export class AgentRuntimeSessionService {
  constructor(
    @InjectModel(AgentSessionBinding.name, DB_CONNECTIONS.AGENT)
    private readonly sessionBindingModel: Model<AgentSessionBindingDocument>,
    private readonly loggerService: LoggerService,
  ) {}

  upsertBindingEffect(
    params: UpsertRuntimeSessionBindingParams,
  ): Effect.Effect<AgentSessionBindingDocument | null, unknown> {
    const nowIso = new Date().toISOString();

    return fromPromiseEffect(() =>
      this.sessionBindingModel.findOneAndUpdate(
        {
          isDeleted: false,
          organization: new Types.ObjectId(params.organizationId),
          thread: new Types.ObjectId(params.threadId),
        },
        {
          $set: {
            ...(params.activeCommandId
              ? { activeCommandId: params.activeCommandId }
              : {}),
            lastSeenAt: nowIso,
            ...(params.metadata ? { metadata: params.metadata } : {}),
            ...(params.model ? { model: params.model } : {}),
            ...(params.resumeCursor
              ? { resumeCursor: params.resumeCursor }
              : {}),
            ...(params.runId ? { runId: params.runId } : {}),
            status: params.status,
          },
          $setOnInsert: {
            organization: new Types.ObjectId(params.organizationId),
            thread: new Types.ObjectId(params.threadId),
          },
        },
        {
          new: true,
          upsert: true,
        },
      ),
    );
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
    return fromPromiseEffect(() =>
      this.sessionBindingModel.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: new Types.ObjectId(threadId),
      }),
    );
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
