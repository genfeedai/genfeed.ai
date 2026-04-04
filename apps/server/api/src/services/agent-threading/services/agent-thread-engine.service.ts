import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  AgentInputRequest,
  type AgentInputRequestDocument,
} from '@api/services/agent-threading/schemas/agent-input-request.schema';
import {
  AgentProfileSnapshot,
  type AgentProfileSnapshotDocument,
} from '@api/services/agent-threading/schemas/agent-profile-snapshot.schema';
import {
  AgentSessionBinding,
  type AgentSessionBindingDocument,
} from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import {
  AgentThreadEvent,
  type AgentThreadEventDocument,
} from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import {
  AgentThreadSnapshot,
  type AgentThreadSnapshotDocument,
} from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import type { AgentThreadEventType } from '@api/services/agent-threading/types/agent-thread.types';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Effect } from 'effect';
import { type Model, Types } from 'mongoose';

export interface AppendAgentThreadEventParams {
  threadId: string;
  organizationId: string;
  commandId: string;
  type: AgentThreadEventType;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  runId?: string;
  userId?: string;
  eventId?: string;
  occurredAt?: string;
}

export interface ResolveAgentInputRequestParams {
  threadId: string;
  organizationId: string;
  requestId: string;
  answer: string;
  userId: string;
}

@Injectable()
export class AgentThreadEngineService {
  constructor(
    @InjectModel(AgentThreadEvent.name, DB_CONNECTIONS.AGENT)
    private readonly eventModel: Model<AgentThreadEventDocument>,
    @InjectModel(AgentThreadSnapshot.name, DB_CONNECTIONS.AGENT)
    private readonly snapshotModel: Model<AgentThreadSnapshotDocument>,
    @InjectModel(AgentSessionBinding.name, DB_CONNECTIONS.AGENT)
    private readonly sessionBindingModel: Model<AgentSessionBindingDocument>,
    @InjectModel(AgentInputRequest.name, DB_CONNECTIONS.AGENT)
    private readonly inputRequestModel: Model<AgentInputRequestDocument>,
    @InjectModel(AgentProfileSnapshot.name, DB_CONNECTIONS.AGENT)
    private readonly profileSnapshotModel: Model<AgentProfileSnapshotDocument>,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly runtimeSessionService: AgentRuntimeSessionService,
    private readonly projectorService: AgentThreadProjectorService,
    private readonly loggerService: LoggerService,
  ) {}

  appendEventEffect(
    params: AppendAgentThreadEventParams,
  ): Effect.Effect<AgentThreadEventDocument, unknown> {
    return fromPromiseEffect(async () => {
      const thread = await this.ensureThreadAccess(
        params.threadId,
        params.organizationId,
      );
      const existingEvent = await this.eventModel.findOne({
        commandId: params.commandId,
        isDeleted: false,
        organization: new Types.ObjectId(params.organizationId),
        thread: new Types.ObjectId(params.threadId),
        type: params.type,
      });

      if (existingEvent) {
        return existingEvent;
      }

      const currentSnapshot = await this.snapshotModel.findOneAndUpdate(
        {
          organization: new Types.ObjectId(params.organizationId),
          thread: new Types.ObjectId(params.threadId),
        },
        {
          $inc: { lastSequence: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: {
            memorySummaryRefs: [],
            organization: new Types.ObjectId(params.organizationId),
            pendingApprovals: [],
            pendingInputRequests: [],
            source: thread.source,
            thread: new Types.ObjectId(params.threadId),
            threadStatus: thread.status,
            timeline: [],
            title: thread.title,
          },
        },
        {
          new: true,
          upsert: true,
        },
      );

      if (!currentSnapshot) {
        throw new NotFoundException('Unable to allocate thread snapshot');
      }

      const event = await this.eventModel.create({
        commandId: params.commandId,
        eventId: params.eventId,
        isDeleted: false,
        metadata: params.metadata,
        occurredAt: params.occurredAt ?? new Date().toISOString(),
        organization: new Types.ObjectId(params.organizationId),
        payload: params.payload,
        runId: params.runId,
        sequence: currentSnapshot.lastSequence,
        thread: new Types.ObjectId(params.threadId),
        type: params.type,
        userId: params.userId,
      });

      await this.applyProjection(currentSnapshot, event, thread);
      await runEffectPromise(
        this.syncSideEffectsEffect(
          event,
          params.organizationId,
          params.threadId,
        ),
      );

      return event;
    });
  }

  async appendEvent(
    params: AppendAgentThreadEventParams,
  ): Promise<AgentThreadEventDocument> {
    return runEffectPromise(this.appendEventEffect(params));
  }

  listEventsEffect(
    threadId: string,
    organizationId: string,
    afterSequence?: number,
  ): Effect.Effect<AgentThreadEventDocument[], unknown> {
    return fromPromiseEffect(async () => {
      await this.ensureThreadAccess(threadId, organizationId);

      const sequenceFilter =
        typeof afterSequence === 'number' && afterSequence > 0
          ? { $gt: afterSequence }
          : undefined;

      return await this.eventModel
        .find({
          ...(sequenceFilter ? { sequence: sequenceFilter } : {}),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          thread: new Types.ObjectId(threadId),
        })
        .sort({ sequence: 1 });
    });
  }

  async listEvents(
    threadId: string,
    organizationId: string,
    afterSequence?: number,
  ): Promise<AgentThreadEventDocument[]> {
    return runEffectPromise(
      this.listEventsEffect(threadId, organizationId, afterSequence),
    );
  }

  getSnapshotEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<AgentThreadSnapshotDocument, unknown> {
    return fromPromiseEffect(async () => {
      const thread = await this.ensureThreadAccess(threadId, organizationId);
      let snapshot = await this.snapshotModel.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: new Types.ObjectId(threadId),
      });

      if (!snapshot) {
        snapshot = await this.snapshotModel.create({
          isDeleted: false,
          lastSequence: 0,
          memorySummaryRefs: [],
          organization: new Types.ObjectId(organizationId),
          pendingApprovals: [],
          pendingInputRequests: [],
          source: thread.source,
          thread: new Types.ObjectId(threadId),
          threadStatus: thread.status,
          timeline: [],
          title: thread.title,
        });
      }

      const sessionBinding = await this.sessionBindingModel.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: new Types.ObjectId(threadId),
      });
      const profileSnapshot = await this.profileSnapshotModel.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        thread: new Types.ObjectId(threadId),
      });

      if (sessionBinding || profileSnapshot) {
        const patch: Record<string, unknown> = {};
        if (sessionBinding) {
          patch.sessionBinding = {
            activeCommandId: sessionBinding.activeCommandId,
            lastSeenAt: sessionBinding.lastSeenAt,
            metadata: sessionBinding.metadata,
            model: sessionBinding.model,
            resumeCursor: sessionBinding.resumeCursor,
            runId: sessionBinding.runId,
            status: sessionBinding.status,
          };
        }
        if (profileSnapshot) {
          patch.profileSnapshot = {
            agentType: profileSnapshot.agentType,
            campaign: profileSnapshot.campaign?.toString(),
            enabledTools: profileSnapshot.enabledTools,
            hooks: profileSnapshot.hooks,
            memoryPolicy: profileSnapshot.memoryPolicy,
            outputRules: profileSnapshot.outputRules,
            promptFragments: profileSnapshot.promptFragments,
            routeKey: profileSnapshot.routeKey,
            strategy: profileSnapshot.strategy?.toString(),
          };
        }

        snapshot = await this.snapshotModel.findOneAndUpdate(
          {
            _id: snapshot._id,
            organization: new Types.ObjectId(organizationId),
          },
          { $set: patch },
          { new: true },
        );
      }

      if (!snapshot) {
        throw new NotFoundException('Thread snapshot not found');
      }

      return snapshot;
    });
  }

  async getSnapshot(
    threadId: string,
    organizationId: string,
  ): Promise<AgentThreadSnapshotDocument> {
    return runEffectPromise(this.getSnapshotEffect(threadId, organizationId));
  }

  resolveInputRequestEffect(
    params: ResolveAgentInputRequestParams,
  ): Effect.Effect<AgentInputRequestDocument, unknown> {
    return Effect.gen(this, function* () {
      yield* fromPromiseEffect(() =>
        this.ensureThreadAccess(params.threadId, params.organizationId),
      );

      const inputRequest = yield* fromPromiseEffect(() =>
        this.inputRequestModel.findOneAndUpdate(
          {
            isDeleted: false,
            organization: new Types.ObjectId(params.organizationId),
            requestId: params.requestId,
            status: 'pending',
            thread: new Types.ObjectId(params.threadId),
          },
          {
            $set: {
              answer: params.answer,
              resolvedAt: new Date().toISOString(),
              status: 'resolved',
            },
          },
          {
            new: true,
          },
        ),
      );

      if (!inputRequest) {
        return yield* Effect.fail(
          new NotFoundException('Input request not found'),
        );
      }

      yield* this.appendEventEffect({
        commandId: `input-response:${params.threadId}:${params.requestId}`,
        organizationId: params.organizationId,
        payload: {
          answer: params.answer,
          requestId: params.requestId,
        },
        threadId: params.threadId,
        type: 'input.resolved',
        userId: params.userId,
      });

      return inputRequest;
    });
  }

  async resolveInputRequest(
    params: ResolveAgentInputRequestParams,
  ): Promise<AgentInputRequestDocument> {
    return runEffectPromise(this.resolveInputRequestEffect(params));
  }

  recordProfileSnapshotEffect(
    threadId: string,
    organizationId: string,
    profileSnapshot: object,
  ): Effect.Effect<AgentProfileSnapshotDocument | null, unknown> {
    return fromPromiseEffect(async () => {
      await this.ensureThreadAccess(threadId, organizationId);

      return await this.profileSnapshotModel.findOneAndUpdate(
        {
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          thread: new Types.ObjectId(threadId),
        },
        {
          $set: {
            ...(profileSnapshot as Record<string, unknown>),
            organization: new Types.ObjectId(organizationId),
            thread: new Types.ObjectId(threadId),
          },
        },
        {
          new: true,
          upsert: true,
        },
      );
    });
  }

  async recordProfileSnapshot(
    threadId: string,
    organizationId: string,
    profileSnapshot: object,
  ): Promise<AgentProfileSnapshotDocument | null> {
    return runEffectPromise(
      this.recordProfileSnapshotEffect(
        threadId,
        organizationId,
        profileSnapshot,
      ),
    );
  }

  recordMemoryFlushEffect(
    threadId: string,
    organizationId: string,
    userId: string,
    content: string,
    tags: string[],
  ): Effect.Effect<string | null, unknown> {
    return Effect.gen(this, function* () {
      const memory = yield* fromPromiseEffect(() =>
        this.agentMemoriesService.createMemory(userId, organizationId, {
          content,
          tags,
        }),
      );

      yield* this.appendEventEffect({
        commandId: `memory-flush:${threadId}:${memory._id}`,
        organizationId,
        payload: {
          memoryId: String(memory._id),
          summary: content.slice(0, 200),
        },
        threadId,
        type: 'memory.flushed',
        userId,
      });

      return String(memory._id);
    });
  }

  async recordMemoryFlush(
    threadId: string,
    organizationId: string,
    userId: string,
    content: string,
    tags: string[],
  ): Promise<string | null> {
    return runEffectPromise(
      this.recordMemoryFlushEffect(
        threadId,
        organizationId,
        userId,
        content,
        tags,
      ),
    );
  }

  private async ensureThreadAccess(
    threadId: string,
    organizationId: string,
  ): Promise<{
    _id: Types.ObjectId;
    source?: string;
    status?: string;
    title?: string;
  }> {
    if (!ObjectIdUtil.isValid(threadId)) {
      throw new BadRequestException('Invalid threadId');
    }
    if (!ObjectIdUtil.isValid(organizationId)) {
      throw new BadRequestException('Invalid organizationId');
    }

    const thread = await this.agentThreadsService.findOne({
      _id: new Types.ObjectId(threadId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!thread) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    return thread as {
      _id: Types.ObjectId;
      source?: string;
      status?: string;
      title?: string;
    };
  }

  private async applyProjection(
    currentSnapshot: AgentThreadSnapshotDocument,
    event: AgentThreadEventDocument,
    thread: {
      status?: string;
      source?: string;
      title?: string;
    },
  ): Promise<void> {
    const projected = this.projectorService.applyEvent(currentSnapshot, event);

    await this.snapshotModel.updateOne(
      {
        _id: currentSnapshot._id,
        organization: currentSnapshot.organization,
      },
      {
        $set: {
          ...projected,
          source: thread.source,
          threadStatus: thread.status,
          title: thread.title,
          updatedAt: new Date(),
        },
      },
    );
  }

  private syncSideEffectsEffect(
    event: AgentThreadEventDocument,
    organizationId: string,
    threadId: string,
  ): Effect.Effect<void, unknown> {
    if (event.type === 'input.requested') {
      const requestId =
        this.readString(event.payload, 'requestId') ??
        `input:${threadId}:${event.sequence}`;
      return fromPromiseEffect(() =>
        this.inputRequestModel.findOneAndUpdate(
          {
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
            requestId,
            thread: new Types.ObjectId(threadId),
          },
          {
            $set: {
              allowFreeText: this.readBoolean(event.payload, 'allowFreeText'),
              fieldId: this.readString(event.payload, 'fieldId'),
              metadata: this.readRecord(event.payload, 'metadata'),
              options: this.readArray(event.payload, 'options') ?? [],
              prompt: this.readString(event.payload, 'prompt') ?? '',
              recommendedOptionId: this.readString(
                event.payload,
                'recommendedOptionId',
              ),
              runId: event.runId,
              status: 'pending',
              title:
                this.readString(event.payload, 'title') ?? 'Input requested',
            },
            $setOnInsert: {
              organization: new Types.ObjectId(organizationId),
              requestId,
              thread: new Types.ObjectId(threadId),
            },
          },
          {
            new: true,
            upsert: true,
          },
        ),
      ).pipe(
        Effect.zipRight(
          this.upsertRuntimeBindingEffect({
            organizationId,
            runId: event.runId,
            status: 'waiting_input',
            threadId,
          }),
        ),
        Effect.asVoid,
      );
    }

    if (
      event.type === 'thread.turn_started' ||
      event.type === 'work.started' ||
      event.type === 'tool.started' ||
      event.type === 'tool.progress'
    ) {
      return this.upsertRuntimeBindingEffect({
        activeCommandId: event.commandId,
        metadata: event.metadata,
        model: this.readString(event.payload, 'model'),
        organizationId,
        runId: event.runId,
        status: 'running',
        threadId,
      });
    }

    if (event.type === 'input.resolved') {
      return this.upsertRuntimeBindingEffect({
        organizationId,
        runId: event.runId,
        status: 'running',
        threadId,
      });
    }

    if (event.type === 'run.cancelled') {
      return this.markRuntimeCancelledEffect(
        threadId,
        organizationId,
        event.runId,
      );
    }

    if (
      event.type === 'run.completed' ||
      event.type === 'assistant.finalized' ||
      event.type === 'work.completed'
    ) {
      return this.upsertRuntimeBindingEffect({
        organizationId,
        runId: event.runId,
        status: 'completed',
        threadId,
      });
    }

    if (event.type === 'run.failed' || event.type === 'error.raised') {
      return this.upsertRuntimeBindingEffect({
        organizationId,
        runId: event.runId,
        status: 'failed',
        threadId,
      });
    }

    return Effect.void;
  }

  private upsertRuntimeBindingEffect(params: {
    threadId: string;
    organizationId: string;
    runId?: string;
    model?: string;
    status: 'running' | 'waiting_input' | 'completed' | 'cancelled' | 'failed';
    activeCommandId?: string;
    metadata?: Record<string, unknown>;
  }): Effect.Effect<void, unknown> {
    return this.runtimeSessionService
      .upsertBindingEffect(params)
      .pipe(Effect.asVoid);
  }

  private markRuntimeCancelledEffect(
    threadId: string,
    organizationId: string,
    runId?: string,
  ): Effect.Effect<void, unknown> {
    return this.runtimeSessionService.markCancelledEffect(
      threadId,
      organizationId,
      runId,
    );
  }

  private readString(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = payload?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readBoolean(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): boolean | undefined {
    const value = payload?.[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private readRecord(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): Record<string, unknown> | undefined {
    const value = payload?.[key];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private readArray(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): Record<string, unknown>[] | undefined {
    const value = payload?.[key];
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    );
  }
}
