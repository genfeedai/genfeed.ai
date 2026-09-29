import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentThreadStatus } from '@genfeedai/contracts';
import {
  AGENT_CHAT_CHANNEL,
  AGENT_THREAD_STATUS_EVENT_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  AgentThreadRunState,
  AgentThreadStatusEvent,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { countAgentThreadStatus } from '@libs/websockets/agent-thread-status.metrics';
import { Injectable } from '@nestjs/common';

export interface PublishAgentThreadStatusParams {
  /** The projected snapshot the recorded event produced. */
  after: AgentThreadSnapshotDocument;
  /** The snapshot as it stood before the event was applied. */
  before: AgentThreadSnapshotDocument;
  organizationId: string;
  threadId: string;
}

/**
 * The snapshot fields that feed the run state. Two snapshots with the same key
 * derive the same state for the same execution, so the event that separates
 * them cannot have changed the status and no lookup is needed.
 */
function statusInputKey(snapshot: AgentThreadSnapshotDocument): string {
  return JSON.stringify([
    snapshot.activeRun?.runId ?? null,
    snapshot.activeRun?.status ?? null,
    snapshot.pendingInputRequests?.length ?? 0,
    snapshot.pendingApprovals?.length ?? 0,
    Boolean(snapshot.latestProposedPlan?.awaitingApproval),
  ]);
}

function isSameRunState(a: AgentThreadRunState, b: AgentThreadRunState) {
  return (
    a.runStatus === b.runStatus &&
    a.runtimeState === b.runtimeState &&
    a.pendingInputCount === b.pendingInputCount
  );
}

/**
 * Publishes one `agent:thread_status` event when a recorded thread event
 * changes the thread's run status (#5636), on the same `agent-chat` channel
 * the agent stream uses. The websocket gateway routes it to the owner's
 * sockets that are authenticated for the thread's organization.
 *
 * Status is derived by `AgentThreadsService.resolveThreadRunState` — the
 * function the thread list uses — for the snapshot before and after the event,
 * so the push carries exactly what a list reload would show and fires only
 * when that derived state moved. Never per token: only events that change the
 * status inputs reach the lookup below.
 */
@Injectable()
export class AgentThreadStatusPublisherService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Best-effort: a failed publish must never fail the event being recorded, and
   * clients recover from a missed push by reloading the list.
   *
   * @returns whether a status event was published.
   */
  async publishIfChanged(
    params: PublishAgentThreadStatusParams,
  ): Promise<boolean> {
    try {
      if (statusInputKey(params.before) === statusInputKey(params.after)) {
        return false;
      }

      const thread = await this.agentThreadsService.findOne({
        id: params.threadId,
        isDeleted: false,
        organizationId: params.organizationId,
      });
      // Archived and deleted threads are not in the sidebar's active list.
      if (
        !thread ||
        thread.isDeleted ||
        thread.status !== AgentThreadStatus.ACTIVE ||
        !thread.userId
      ) {
        return false;
      }

      const latestExecution =
        await this.agentThreadsService.findLatestExecution(
          params.organizationId,
          params.threadId,
        );
      const before = this.agentThreadsService.resolveThreadRunState(
        params.before,
        latestExecution,
      );
      const after = this.agentThreadsService.resolveThreadRunState(
        params.after,
        latestExecution,
      );
      if (isSameRunState(before, after)) {
        return false;
      }

      const event: AgentThreadStatusEvent = {
        ...after,
        organizationId: params.organizationId,
        sequence: params.after.lastSequence,
        threadId: params.threadId,
        timestamp: new Date().toISOString(),
        userId: String(thread.userId),
      };
      await this.redisService.publish(AGENT_CHAT_CHANNEL, {
        data: event,
        type: AGENT_THREAD_STATUS_EVENT_TYPE,
      });
      countAgentThreadStatus('published', 1, { runStatus: after.runStatus });
      return true;
    } catch (error: unknown) {
      countAgentThreadStatus('publish_failed');
      this.loggerService.warn(
        `${this.constructorName} failed to publish thread status`,
        {
          error: error instanceof Error ? error.message : String(error),
          threadId: params.threadId,
        },
      );
      return false;
    }
  }
}
