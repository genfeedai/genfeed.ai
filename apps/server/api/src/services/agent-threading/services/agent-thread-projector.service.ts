import type { AgentThreadEventDocument } from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type {
  AgentThreadTimelineEntry,
  AgentThreadUiBlocksState,
} from '@api/services/agent-threading/types/agent-thread.types';
import { Injectable } from '@nestjs/common';

const MAX_TIMELINE_ENTRIES = 250;

type MutableSnapshot = Record<string, unknown>;

@Injectable()
export class AgentThreadProjectorService {
  applyEvent(
    snapshot: AgentThreadSnapshotDocument | null,
    event: AgentThreadEventDocument,
  ): MutableSnapshot {
    const nextSnapshot = this.toMutableSnapshot(snapshot);
    nextSnapshot.lastSequence = event.sequence;

    const timelineEntry = this.buildTimelineEntry(event);
    if (timelineEntry) {
      nextSnapshot.timeline = this.appendTimelineEntry(
        nextSnapshot.timeline,
        timelineEntry,
      );
    }

    switch (event.type) {
      case 'thread.turn_requested':
        nextSnapshot.activeRun = {
          ...(this.asRecord(nextSnapshot.activeRun) ?? {}),
          ...(event.runId ? { runId: event.runId } : {}),
          ...(this.readString(event.payload, 'model')
            ? { model: this.readString(event.payload, 'model') }
            : {}),
          startedAt:
            this.readString(event.payload, 'startedAt') ?? event.occurredAt,
          status: 'queued',
        };
        break;
      case 'thread.turn_started':
      case 'work.started':
        nextSnapshot.activeRun = {
          ...(this.asRecord(nextSnapshot.activeRun) ?? {}),
          ...(event.runId ? { runId: event.runId } : {}),
          ...(this.readString(event.payload, 'model')
            ? { model: this.readString(event.payload, 'model') }
            : {}),
          startedAt:
            this.readString(event.payload, 'startedAt') ?? event.occurredAt,
          status: 'running',
        };
        break;
      case 'assistant.finalized':
        nextSnapshot.lastAssistantMessage = {
          content: this.readString(event.payload, 'content') ?? '',
          createdAt: event.occurredAt ?? new Date().toISOString(),
          messageId:
            this.readString(event.payload, 'messageId') ??
            `${event.thread.toString()}:${event.sequence}`,
          metadata: this.readRecord(event.payload, 'metadata'),
        };
        break;
      case 'input.requested':
        nextSnapshot.pendingInputRequests = this.upsertPendingInputRequest(
          nextSnapshot.pendingInputRequests,
          event,
        );
        break;
      case 'input.resolved':
        nextSnapshot.pendingInputRequests = this.removePendingInputRequest(
          nextSnapshot.pendingInputRequests,
          this.readString(event.payload, 'requestId'),
        );
        break;
      case 'plan.upserted':
        nextSnapshot.latestProposedPlan = {
          approvedAt: this.readString(event.payload, 'approvedAt'),
          awaitingApproval: this.readBoolean(event.payload, 'awaitingApproval'),
          content: this.readString(event.payload, 'content'),
          createdAt: event.occurredAt ?? new Date().toISOString(),
          explanation: this.readString(event.payload, 'explanation'),
          id:
            this.readString(event.payload, 'id') ??
            `plan:${event.thread.toString()}:${event.sequence}`,
          lastReviewAction: this.readString(event.payload, 'lastReviewAction'),
          revisionNote: this.readString(event.payload, 'revisionNote'),
          status: this.readString(event.payload, 'status'),
          steps: this.readArray(event.payload, 'steps'),
          updatedAt: event.occurredAt ?? new Date().toISOString(),
        };
        break;
      case 'ui.blocks_updated':
        nextSnapshot.latestUiBlocks = {
          blockIds: this.readStringArray(event.payload, 'blockIds'),
          blocks: this.readArray(event.payload, 'blocks'),
          operation: this.readString(event.payload, 'operation') ?? 'replace',
          updatedAt: event.occurredAt ?? new Date().toISOString(),
        } satisfies Partial<AgentThreadUiBlocksState>;
        break;
      case 'run.cancelled':
      case 'run.completed':
      case 'run.failed':
      case 'work.completed':
      case 'error.raised':
        nextSnapshot.activeRun = {
          ...(this.asRecord(nextSnapshot.activeRun) ?? {}),
          completedAt: event.occurredAt ?? new Date().toISOString(),
          ...(event.runId ? { runId: event.runId } : {}),
          status: this.statusForTerminalEvent(event.type),
        };
        break;
      case 'memory.flushed':
        nextSnapshot.memorySummaryRefs = this.appendMemoryRef(
          nextSnapshot.memorySummaryRefs,
          this.readString(event.payload, 'memoryId'),
        );
        break;
      default:
        break;
    }

    if (event.type === 'tool.started' || event.type === 'tool.progress') {
      nextSnapshot.activeRun = {
        ...(this.asRecord(nextSnapshot.activeRun) ?? {}),
        ...(event.runId ? { runId: event.runId } : {}),
        status: 'running',
      };
    }

    if (event.type === 'tool.completed') {
      nextSnapshot.activeRun = {
        ...(this.asRecord(nextSnapshot.activeRun) ?? {}),
        ...(event.runId ? { runId: event.runId } : {}),
        status:
          this.readString(event.payload, 'status') === 'failed'
            ? 'failed'
            : 'running',
      };
    }

    return nextSnapshot;
  }

  private toMutableSnapshot(
    snapshot: AgentThreadSnapshotDocument | null,
  ): MutableSnapshot {
    return {
      activeRun: snapshot?.activeRun ?? undefined,
      lastAssistantMessage: snapshot?.lastAssistantMessage ?? undefined,
      lastSequence: snapshot?.lastSequence ?? 0,
      latestProposedPlan: snapshot?.latestProposedPlan ?? undefined,
      latestUiBlocks: snapshot?.latestUiBlocks ?? undefined,
      memorySummaryRefs: snapshot?.memorySummaryRefs ?? [],
      pendingApprovals: snapshot?.pendingApprovals ?? [],
      pendingInputRequests: snapshot?.pendingInputRequests ?? [],
      profileSnapshot: snapshot?.profileSnapshot ?? undefined,
      sessionBinding: snapshot?.sessionBinding ?? undefined,
      source: snapshot?.source,
      thread: snapshot?.thread,
      threadStatus: snapshot?.threadStatus,
      timeline: snapshot?.timeline ?? [],
      title: snapshot?.title,
    };
  }

  private buildTimelineEntry(
    event: AgentThreadEventDocument,
  ): AgentThreadTimelineEntry | null {
    const baseEntry = {
      createdAt: event.occurredAt ?? new Date().toISOString(),
      id: event.eventId ?? `${event.thread.toString()}:${event.sequence}`,
      payload: {
        ...(event.payload ?? {}),
        sourceEventType: event.type,
      },
      runId: event.runId,
      sequence: event.sequence,
    };

    switch (event.type) {
      case 'thread.turn_requested':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'content'),
          kind: 'message',
          label: 'User message',
          role: 'user',
        };
      case 'thread.turn_started':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'detail'),
          kind: 'work',
          label: 'Turn started',
          status: 'running',
        };
      case 'assistant.delta':
      case 'assistant.finalized':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'content'),
          kind: 'assistant',
          label:
            event.type === 'assistant.delta'
              ? 'Assistant streaming'
              : 'Assistant response',
          role: 'assistant',
        };
      case 'input.requested':
      case 'input.resolved':
        return {
          ...baseEntry,
          detail:
            this.readString(event.payload, 'prompt') ??
            this.readString(event.payload, 'answer'),
          kind: 'input',
          label:
            event.type === 'input.requested'
              ? 'Input requested'
              : 'Input resolved',
          requestId: this.readString(event.payload, 'requestId'),
          status: event.type === 'input.requested' ? 'pending' : 'completed',
        };
      case 'plan.upserted':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'content'),
          kind: 'plan',
          label: 'Plan updated',
        };
      case 'tool.started':
      case 'tool.progress':
      case 'tool.completed':
        return {
          ...baseEntry,
          detail:
            this.readString(event.payload, 'message') ??
            this.readString(event.payload, 'detail') ??
            this.readString(event.payload, 'error'),
          kind: 'tool',
          label:
            event.type === 'tool.started'
              ? 'Tool started'
              : event.type === 'tool.progress'
                ? 'Tool progress'
                : 'Tool completed',
          status: this.readString(event.payload, 'status'),
          toolName: this.readString(event.payload, 'toolName'),
        };
      case 'work.started':
      case 'work.updated':
      case 'work.completed':
      case 'run.cancelled':
      case 'run.completed':
      case 'run.failed':
        return {
          ...baseEntry,
          detail:
            this.readString(event.payload, 'detail') ??
            this.readString(event.payload, 'error'),
          kind: 'work',
          label: this.readString(event.payload, 'label') ?? event.type,
          status: this.readString(event.payload, 'status'),
        };
      case 'ui.blocks_updated':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'operation'),
          kind: 'system',
          label: 'Dashboard updated',
        };
      case 'memory.flushed':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'summary'),
          kind: 'system',
          label: 'Memory flushed',
        };
      case 'error.raised':
        return {
          ...baseEntry,
          detail: this.readString(event.payload, 'error'),
          kind: 'error',
          label: 'Agent error',
          status: 'failed',
        };
      default:
        return null;
    }
  }

  private appendTimelineEntry(
    currentTimeline: unknown,
    nextEntry: AgentThreadTimelineEntry,
  ): AgentThreadTimelineEntry[] {
    const timeline = Array.isArray(currentTimeline)
      ? (currentTimeline as AgentThreadTimelineEntry[])
      : [];

    return [...timeline, nextEntry].slice(-MAX_TIMELINE_ENTRIES);
  }

  private upsertPendingInputRequest(
    currentRequests: unknown,
    event: AgentThreadEventDocument,
  ): Record<string, unknown>[] {
    const requests = Array.isArray(currentRequests)
      ? (currentRequests as Record<string, unknown>[])
      : [];
    const requestId = this.readString(event.payload, 'requestId');
    if (!requestId) {
      return requests;
    }

    const next = {
      allowFreeText: this.readBoolean(event.payload, 'allowFreeText'),
      createdAt: event.occurredAt ?? new Date().toISOString(),
      fieldId: this.readString(event.payload, 'fieldId'),
      metadata: this.readRecord(event.payload, 'metadata'),
      options: this.readArray(event.payload, 'options') ?? [],
      prompt: this.readString(event.payload, 'prompt') ?? '',
      recommendedOptionId: this.readString(
        event.payload,
        'recommendedOptionId',
      ),
      requestId,
      title: this.readString(event.payload, 'title') ?? 'Input requested',
    };

    const withoutCurrent = requests.filter(
      (entry) => entry.requestId !== requestId,
    );
    return [...withoutCurrent, next];
  }

  private removePendingInputRequest(
    currentRequests: unknown,
    requestId: string | undefined,
  ): Record<string, unknown>[] {
    const requests = Array.isArray(currentRequests)
      ? (currentRequests as Record<string, unknown>[])
      : [];
    if (!requestId) {
      return requests;
    }
    return requests.filter((entry) => entry.requestId !== requestId);
  }

  private appendMemoryRef(
    currentMemoryRefs: unknown,
    memoryId: string | undefined,
  ): string[] {
    const refs = Array.isArray(currentMemoryRefs)
      ? (currentMemoryRefs as string[])
      : [];
    if (!memoryId || refs.includes(memoryId)) {
      return refs;
    }
    return [...refs, memoryId];
  }

  private statusForTerminalEvent(eventType: string): string {
    switch (eventType) {
      case 'run.cancelled':
        return 'cancelled';
      case 'run.failed':
      case 'error.raised':
        return 'failed';
      default:
        return 'completed';
    }
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
    return this.asRecord(value);
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

  private readStringArray(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): string[] | undefined {
    const value = payload?.[key];
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }
}
