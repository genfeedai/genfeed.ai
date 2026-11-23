import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { AgentPendingInputRequest } from '@api/services/agent-threading/types/agent-thread.types';
import {
  ActivityKey,
  ActivitySource,
  AgentThreadStatus,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const ALERT_LABEL_MAX_LENGTH = 300;

export interface RecordAgentInputAlertParams {
  /** The snapshot the recorded event produced. */
  after: AgentThreadSnapshotDocument;
  /** The snapshot as it stood before the event was applied. */
  before: AgentThreadSnapshotDocument;
  organizationId: string;
  threadId: string;
}

/**
 * Raises one bell alert when an agent run starts waiting on a person's answer
 * (#10896). The question itself stays in the thread and in the review inbox;
 * the alert only tells its owner that a run is paused on it. It is recorded as
 * an activity, so the alert policy decides who is told and on which channels,
 * and a repeat of the same question is recorded once.
 */
@Traced()
@Injectable()
export class AgentInputAlertService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Best-effort: a failed alert must never fail the event being recorded.
   *
   * @returns how many alerts were recorded.
   */
  async recordNewQuestions(
    params: RecordAgentInputAlertParams,
  ): Promise<number> {
    try {
      const known = new Set(
        (params.before.pendingInputRequests ?? []).map(
          (request) => request.requestId,
        ),
      );
      const added = (params.after.pendingInputRequests ?? []).filter(
        (request) => !known.has(request.requestId),
      );
      if (added.length === 0) return 0;

      const thread = await this.agentThreadsService.findOneSelect(
        {
          id: params.threadId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
        { brandId: true, status: true, userId: true },
      );
      // Archived threads leave the active list, and a thread with no owner has
      // nobody to tell.
      if (
        !thread ||
        thread.status !== AgentThreadStatus.ACTIVE ||
        !thread.userId
      ) {
        return 0;
      }
      for (const request of added) {
        await this.recordQuestion(params, thread, request);
      }
      return added.length;
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} failed to record the question alert`,
        {
          error: error instanceof Error ? error.message : String(error),
          threadId: params.threadId,
        },
      );
      return 0;
    }
  }

  private async recordQuestion(
    params: RecordAgentInputAlertParams,
    thread: { brandId: string | null; userId: string },
    request: AgentPendingInputRequest,
  ): Promise<void> {
    await this.activityRecorder.record({
      alert: {
        deduplicationKey: `${ActivityKey.AGENT_INPUT_REQUESTED}/${params.threadId}/${request.requestId}`,
        // A run's alerts open its thread (and its agent) from the bell.
        source: request.runId
          ? { id: request.runId, type: 'agent_run' }
          : { id: params.threadId, type: 'agent_thread' },
      },
      brandId: thread.brandId,
      data: { requestId: request.requestId, threadId: params.threadId },
      entityId: params.threadId,
      entityModel: 'AgentThread',
      key: ActivityKey.AGENT_INPUT_REQUESTED,
      organizationId: params.organizationId,
      source: ActivitySource.AGENT_RUN,
      userId: thread.userId,
      value: request.title.slice(0, ALERT_LABEL_MAX_LENGTH),
    });
  }
}
