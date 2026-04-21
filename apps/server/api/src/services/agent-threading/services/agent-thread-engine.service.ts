import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import type { AgentInputRequestDocument } from '@api/services/agent-threading/schemas/agent-input-request.schema';
import type { AgentProfileSnapshotDocument } from '@api/services/agent-threading/schemas/agent-profile-snapshot.schema';
import type { AgentThreadEventDocument } from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { AgentThreadEventType } from '@api/services/agent-threading/types/agent-thread.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

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

/**
 * Adapts a raw Prisma AgentThreadEvent row into the shape expected by
 * AgentThreadProjectorService and other callers consuming AgentThreadEventDocument.
 *
 * Prisma stores: commandId, runId, type as top-level columns.
 * Prisma stores: payload, metadata, eventId, userId, occurredAt inside data: Json.
 */
function toPrismaEventDocument(
  row: Record<string, unknown>,
): AgentThreadEventDocument {
  const data = (row.data as Record<string, unknown>) ?? {};
  return {
    _id: row.id as string,
    id: row.id as string,
    organizationId: row.organizationId as string,
    threadId: row.threadId as string,
    // Keep legacy reference fields for the projector contract.
    organization: row.organizationId as unknown,
    thread: row.threadId as unknown,
    sequence: row.sequence as number,
    commandId: row.commandId as string,
    type: row.type as AgentThreadEventType,
    runId: (row.runId ?? data.runId) as string | undefined,
    eventId: data.eventId as string | undefined,
    userId: data.userId as string | undefined,
    occurredAt: data.occurredAt as string | undefined,
    payload: data.payload as Record<string, unknown> | undefined,
    metadata: data.metadata as Record<string, unknown> | undefined,
    isDeleted: row.isDeleted as boolean,
  } as unknown as AgentThreadEventDocument;
}

/**
 * Adapts a raw Prisma AgentThreadSnapshot row into AgentThreadSnapshotDocument shape.
 *
 * Prisma stores all snapshot fields (lastSequence, pendingInputRequests, etc.)
 * inside data: Json. This adapter unwraps them so the projector service can
 * access them as first-class properties.
 */
function toPrismaSnapshotDocument(
  row: Record<string, unknown>,
): AgentThreadSnapshotDocument {
  const data = (row.data as Record<string, unknown>) ?? {};
  return {
    _id: row.id as string,
    id: row.id as string,
    organizationId: row.organizationId as string,
    threadId: row.threadId as string,
    organization: row.organizationId as unknown,
    thread: row.threadId as unknown,
    lastSequence: (data.lastSequence as number) ?? 0,
    title: data.title as string | undefined,
    source: data.source as string | undefined,
    threadStatus: data.threadStatus as string | undefined,
    activeRun: data.activeRun as Record<string, unknown> | undefined,
    pendingApprovals:
      (data.pendingApprovals as Record<string, unknown>[]) ?? [],
    pendingInputRequests:
      (data.pendingInputRequests as Record<string, unknown>[]) ?? [],
    latestProposedPlan: data.latestProposedPlan as
      | Record<string, unknown>
      | undefined,
    latestUiBlocks: data.latestUiBlocks as Record<string, unknown> | undefined,
    lastAssistantMessage: data.lastAssistantMessage as
      | Record<string, unknown>
      | undefined,
    memorySummaryRefs: (data.memorySummaryRefs as string[]) ?? [],
    timeline: (data.timeline as Record<string, unknown>[]) ?? [],
    sessionBinding: data.sessionBinding as Record<string, unknown> | undefined,
    profileSnapshot: data.profileSnapshot as
      | Record<string, unknown>
      | undefined,
    isDeleted: row.isDeleted as boolean,
  } as unknown as AgentThreadSnapshotDocument;
}

/**
 * Adapts a raw Prisma AgentThreadSnapshot row into AgentInputRequestDocument shape.
 * Input requests are stored in snapshot.data.inputRequests[] keyed by requestId.
 */
function findInputRequestInSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  requestId: string,
): AgentInputRequestDocument | null {
  if (!snapshot) return null;
  const data = (snapshot.data as Record<string, unknown>) ?? {};
  const requests = (data.inputRequests as Array<Record<string, unknown>>) ?? [];
  const req = requests.find((r) => r.requestId === requestId);
  if (!req) return null;
  return {
    _id: `${snapshot.id as string}:${requestId}`,
    id: `${snapshot.id as string}:${requestId}`,
    organizationId: snapshot.organizationId as string,
    threadId: snapshot.threadId as string,
    organization: snapshot.organizationId as unknown,
    thread: snapshot.threadId as unknown,
    requestId: req.requestId as string,
    status: req.status as string,
    title: req.title as string,
    prompt: req.prompt as string,
    allowFreeText: req.allowFreeText as boolean | undefined,
    recommendedOptionId: req.recommendedOptionId as string | undefined,
    options: (req.options as Record<string, unknown>[]) ?? [],
    fieldId: req.fieldId as string | undefined,
    metadata: req.metadata as Record<string, unknown> | undefined,
    answer: req.answer as string | undefined,
    runId: req.runId as string | undefined,
    resolvedAt: req.resolvedAt as string | undefined,
    isDeleted: false,
  } as unknown as AgentInputRequestDocument;
}

@Injectable()
export class AgentThreadEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly runtimeSessionService: AgentRuntimeSessionService,
    private readonly projectorService: AgentThreadProjectorService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly threadContextCompressorService?: ThreadContextCompressorService,
  ) {}

  appendEventEffect(
    params: AppendAgentThreadEventParams,
  ): Effect.Effect<AgentThreadEventDocument, unknown> {
    return fromPromiseEffect(async () => {
      const thread = await this.ensureThreadAccess(
        params.threadId,
        params.organizationId,
      );

      // Check idempotency — do not create duplicate events for the same commandId+type
      const existingRow = await this.prisma.agentThreadEvent.findFirst({
        where: {
          commandId: params.commandId,
          isDeleted: false,
          organizationId: params.organizationId,
          threadId: params.threadId,
          type: params.type,
        },
      });

      if (existingRow) {
        return toPrismaEventDocument(
          existingRow as unknown as Record<string, unknown>,
        );
      }

      // Upsert snapshot to increment sequence (atomic increment via update-then-create)
      let snapshotRow = await this.prisma.agentThreadSnapshot.findFirst({
        where: {
          isDeleted: false,
          organizationId: params.organizationId,
          threadId: params.threadId,
        },
      });

      if (snapshotRow) {
        const existingData =
          (snapshotRow.data as Record<string, unknown>) ?? {};
        const lastSequence = ((existingData.lastSequence as number) ?? 0) + 1;
        snapshotRow = await this.prisma.agentThreadSnapshot.update({
          where: { id: snapshotRow.id },
          data: {
            data: { ...existingData, lastSequence },
            updatedAt: new Date(),
          },
        });
      } else {
        snapshotRow = await this.prisma.agentThreadSnapshot.create({
          data: {
            organizationId: params.organizationId,
            threadId: params.threadId,
            isDeleted: false,
            data: {
              lastSequence: 1,
              memorySummaryRefs: [],
              pendingApprovals: [],
              pendingInputRequests: [],
              source: thread.source,
              threadStatus: thread.status,
              timeline: [],
              title: thread.title,
            },
          },
        });
      }

      if (!snapshotRow) {
        throw new NotFoundException('Unable to allocate thread snapshot');
      }

      const snapshotData = (snapshotRow.data as Record<string, unknown>) ?? {};
      const sequence = (snapshotData.lastSequence as number) ?? 1;

      // Store all per-event fields in data Json; top-level columns are commandId, runId, type
      const eventDataPayload: Record<string, unknown> = {
        occurredAt: params.occurredAt ?? new Date().toISOString(),
      };
      if (params.payload) eventDataPayload.payload = params.payload;
      if (params.metadata) eventDataPayload.metadata = params.metadata;
      if (params.eventId) eventDataPayload.eventId = params.eventId;
      if (params.userId) eventDataPayload.userId = params.userId;
      if (params.runId) eventDataPayload.runId = params.runId;

      const createdRow = await this.prisma.agentThreadEvent.create({
        data: {
          commandId: params.commandId,
          isDeleted: false,
          organizationId: params.organizationId,
          runId: params.runId,
          sequence,
          threadId: params.threadId,
          type: params.type,
          data: eventDataPayload,
        },
      });

      const event = toPrismaEventDocument(
        createdRow as unknown as Record<string, unknown>,
      );
      const currentSnapshot = toPrismaSnapshotDocument(
        snapshotRow as unknown as Record<string, unknown>,
      );

      await this.applyProjection(
        currentSnapshot,
        event,
        thread,
        snapshotRow.id,
      );
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

      const rows = await this.prisma.agentThreadEvent.findMany({
        where: {
          isDeleted: false,
          organizationId,
          threadId,
          ...(typeof afterSequence === 'number' && afterSequence > 0
            ? { sequence: { gt: afterSequence } }
            : {}),
        },
        orderBy: { sequence: 'asc' },
      });

      return rows.map((row) =>
        toPrismaEventDocument(row as unknown as Record<string, unknown>),
      );
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
      let snapshotRow = await this.prisma.agentThreadSnapshot.findFirst({
        where: {
          isDeleted: false,
          organizationId,
          threadId,
        },
      });

      if (!snapshotRow) {
        snapshotRow = await this.prisma.agentThreadSnapshot.create({
          data: {
            organizationId,
            threadId,
            isDeleted: false,
            data: {
              lastSequence: 0,
              memorySummaryRefs: [],
              pendingApprovals: [],
              pendingInputRequests: [],
              source: thread.source,
              threadStatus: thread.status,
              timeline: [],
              title: thread.title,
            },
          },
        });
      }

      // Merge sessionBinding and profileSnapshot from snapshot.data into the document
      // (they are already stored there via upsertBindingEffect / recordProfileSnapshotEffect)
      const snapshot = toPrismaSnapshotDocument(
        snapshotRow as unknown as Record<string, unknown>,
      );

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

      // Input requests are stored inside snapshot.data.inputRequests[]
      const snapshotRow = yield* fromPromiseEffect(() =>
        this.prisma.agentThreadSnapshot.findFirst({
          where: {
            isDeleted: false,
            organizationId: params.organizationId,
            threadId: params.threadId,
          },
        }),
      );

      if (!snapshotRow) {
        return yield* Effect.fail(
          new NotFoundException('Input request not found'),
        );
      }

      const snapshotData = (snapshotRow.data as Record<string, unknown>) ?? {};
      const inputRequests =
        (snapshotData.inputRequests as Array<Record<string, unknown>>) ?? [];

      const reqIndex = inputRequests.findIndex(
        (r) => r.requestId === params.requestId && r.status === 'pending',
      );

      if (reqIndex === -1) {
        return yield* Effect.fail(
          new NotFoundException('Input request not found'),
        );
      }

      // Update the request in-place
      inputRequests[reqIndex] = {
        ...inputRequests[reqIndex],
        answer: params.answer,
        resolvedAt: new Date().toISOString(),
        status: 'resolved',
      };

      yield* fromPromiseEffect(() =>
        this.prisma.agentThreadSnapshot.update({
          where: { id: snapshotRow.id },
          data: {
            data: { ...snapshotData, inputRequests },
            updatedAt: new Date(),
          },
        }),
      );

      const inputRequest = findInputRequestInSnapshot(
        {
          ...(snapshotRow as unknown as Record<string, unknown>),
          data: { ...snapshotData, inputRequests },
        },
        params.requestId,
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

      const existing = await this.prisma.agentThreadSnapshot.findFirst({
        where: { isDeleted: false, organizationId, threadId },
      });

      const profileData = profileSnapshot as Record<string, unknown>;

      if (existing) {
        const existingData = (existing.data as Record<string, unknown>) ?? {};
        const updated = await this.prisma.agentThreadSnapshot.update({
          where: { id: existing.id },
          data: {
            data: {
              ...existingData,
              profileSnapshot: {
                ...((existingData.profileSnapshot as Record<string, unknown>) ??
                  {}),
                ...profileData,
                organizationId,
                threadId,
              },
            },
            updatedAt: new Date(),
          },
        });

        const data = (updated.data as Record<string, unknown>) ?? {};
        const ps = data.profileSnapshot as Record<string, unknown>;
        return {
          _id: updated.id,
          id: updated.id,
          organizationId,
          threadId,
          organization: organizationId as unknown,
          thread: threadId as unknown,
          ...ps,
          isDeleted: false,
        } as unknown as AgentProfileSnapshotDocument;
      }

      const created = await this.prisma.agentThreadSnapshot.create({
        data: {
          organizationId,
          threadId,
          isDeleted: false,
          data: {
            profileSnapshot: { ...profileData, organizationId, threadId },
          },
        },
      });

      const data = (created.data as Record<string, unknown>) ?? {};
      const ps = data.profileSnapshot as Record<string, unknown>;
      return {
        _id: created.id,
        id: created.id,
        organizationId,
        threadId,
        organization: organizationId as unknown,
        thread: threadId as unknown,
        ...ps,
        isDeleted: false,
      } as unknown as AgentProfileSnapshotDocument;
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
    id: string;
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
      _id: threadId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!thread) {
      throw new NotFoundException(`Thread "${threadId}" not found`);
    }

    return thread as {
      id: string;
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
    snapshotId: string,
  ): Promise<void> {
    const projected = this.projectorService.applyEvent(currentSnapshot, event);

    const existingRow = await this.prisma.agentThreadSnapshot.findUnique({
      where: { id: snapshotId },
    });
    const existingData = (existingRow?.data as Record<string, unknown>) ?? {};

    await this.prisma.agentThreadSnapshot.update({
      where: { id: snapshotId },
      data: {
        data: {
          ...existingData,
          ...projected,
          source: thread.source,
          threadStatus: thread.status,
          title: thread.title,
        },
        updatedAt: new Date(),
      },
    });
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

      // Store the input request inside snapshot.data.inputRequests[]
      return fromPromiseEffect(async () => {
        const snapshotRow = await this.prisma.agentThreadSnapshot.findFirst({
          where: { isDeleted: false, organizationId, threadId },
        });

        if (!snapshotRow) return;

        const snapshotData =
          (snapshotRow.data as Record<string, unknown>) ?? {};
        const inputRequests = (
          (snapshotData.inputRequests as Array<Record<string, unknown>>) ?? []
        ).filter((r) => r.requestId !== requestId);

        inputRequests.push({
          allowFreeText: this.readBoolean(event.payload, 'allowFreeText'),
          fieldId: this.readString(event.payload, 'fieldId'),
          metadata: this.readRecord(event.payload, 'metadata'),
          options: this.readArray(event.payload, 'options') ?? [],
          prompt: this.readString(event.payload, 'prompt') ?? '',
          recommendedOptionId: this.readString(
            event.payload,
            'recommendedOptionId',
          ),
          requestId,
          runId: event.runId,
          status: 'pending',
          title: this.readString(event.payload, 'title') ?? 'Input requested',
        });

        await this.prisma.agentThreadSnapshot.update({
          where: { id: snapshotRow.id },
          data: {
            data: { ...snapshotData, inputRequests },
            updatedAt: new Date(),
          },
        });
      }).pipe(
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
      // Trigger async context compression on turn completion
      if (
        event.type === 'assistant.finalized' &&
        this.threadContextCompressorService
      ) {
        this.threadContextCompressorService
          .compressIfNeeded(threadId, organizationId)
          .catch((err) =>
            this.loggerService.warn(
              'AgentThreadEngineService: Context compression failed',
              { err, threadId },
            ),
          );
      }

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
