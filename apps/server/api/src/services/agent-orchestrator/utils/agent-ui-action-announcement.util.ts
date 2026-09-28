import { describeUiActionFailure } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-error';
import type { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatResult,
  AgentThreadUiActionRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { getAgentUiActionSourceId } from '@genfeedai/contracts/interfaces';

export interface AnnounceUiActionRunParams {
  context: AgentChatContext;
  request: AgentThreadUiActionRequest;
  run: () => Promise<AgentChatResult>;
  streamEffects: Pick<
    AgentStreamEffectsService,
    'publishUiActionDone' | 'publishUiActionFailure'
  >;
  threadEventRecorder: Pick<
    AgentThreadEventRecorderService,
    'readRunTerminalSequence' | 'recordRunFailed'
  >;
}

async function readRunTerminalSequence(
  recorder: AnnounceUiActionRunParams['threadEventRecorder'],
  threadId: string,
  context: AgentChatContext,
): Promise<number | undefined> {
  if (!context.executionId) {
    return undefined;
  }
  try {
    return await recorder.readRunTerminalSequence({
      organizationId: context.organizationId,
      runId: context.executionId,
      threadId,
    });
  } catch {
    return undefined;
  }
}

/**
 * Runs one ui-action and announces its result on the turn channel. The run's
 * events are already in the thread log (the ui-action service records them);
 * this only tells a connected client, tagged with the position of the run's
 * own terminal event, so a client that already applied it drops it.
 */
export async function announceUiActionRun(
  params: AnnounceUiActionRunParams,
): Promise<AgentChatResult> {
  const { context, request, streamEffects, threadEventRecorder } = params;
  const uiAction = {
    action: request.action,
    sourceId: getAgentUiActionSourceId(request.payload),
  };
  try {
    const result = await params.run();
    await streamEffects.publishUiActionDone({
      context,
      result,
      sequence: await readRunTerminalSequence(
        threadEventRecorder,
        request.threadId,
        context,
      ),
      threadId: request.threadId,
      uiAction,
    });
    return result;
  } catch (error: unknown) {
    const failure = describeUiActionFailure(error);
    try {
      // Failures before the run reached its lane (an archived or foreign
      // thread) have no failure event yet; one recorded inside the lane
      // shares this command id, so this is a no-op for it.
      await threadEventRecorder.recordRunFailed({
        context,
        error: failure,
        runId: context.executionId,
        threadId: request.threadId,
      });
    } catch {
      // An inaccessible thread cannot take the event; the client still hears
      // of the failure below.
    }
    await streamEffects.publishUiActionFailure({
      context,
      error: failure,
      sequence: await readRunTerminalSequence(
        threadEventRecorder,
        request.threadId,
        context,
      ),
      threadId: request.threadId,
      uiAction,
    });
    throw error;
  }
}
