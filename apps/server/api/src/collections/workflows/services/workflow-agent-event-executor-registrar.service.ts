import { AGENT_EVENT_RUN_WINDOW_MS } from '@api/services/agent-event-run/agent-event-run.constants';
import { AgentEventRunService } from '@api/services/agent-event-run/agent-event-run.service';
import type {
  AgentEventRunOutcome,
  AgentEventRunSkipReason,
} from '@api/services/agent-event-run/agent-event-run.types';
import type { WorkflowEngine } from '@genfeedai/workflows/engine';
import { BadRequestException, Injectable } from '@nestjs/common';

const EVENT_TEXT_INPUT_KEYS = ['eventText', 'text', 'content'];
const EVENT_ID_INPUT_KEYS = ['eventId', 'postId', 'commentId', 'id'];

const SKIP_MESSAGES: Record<AgentEventRunSkipReason, string> = {
  budget_reached:
    'The agent has used its daily credit budget, so no run started.',
  daily_cap_reached: `The agent already started its limit of runs from events in the last ${AGENT_EVENT_RUN_WINDOW_MS / 3_600_000} hours, so no run started.`,
  duplicate_event: 'This event already started a run, so no new run started.',
  event_withheld:
    'The event text looked like instructions to the agent, so it was withheld and no run started.',
};

function readInputText(
  inputs: Map<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = inputs.get(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return undefined;
}

function readConfigText(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** What the run history shows for the step: whether a run started, and why not. */
function describeAgentEventRunOutcome(outcome: AgentEventRunOutcome): {
  agentExecutionId: string | null;
  message: string;
  reason: AgentEventRunSkipReason | null;
  started: boolean;
  threadId: string | null;
} {
  if (outcome.started) {
    return {
      agentExecutionId: outcome.agentExecutionId,
      message: 'The agent run started. Its result lands in review as a draft.',
      reason: null,
      started: true,
      threadId: outcome.threadId,
    };
  }
  return {
    agentExecutionId: null,
    message: SKIP_MESSAGES[outcome.reason],
    reason: outcome.reason,
    started: false,
    threadId: null,
  };
}

/**
 * The `agentEventRun` workflow step: runs a hired content agent with the
 * trigger event as its brief (#10897). A step that cannot start a run because
 * of the cap, the budget or a replay finishes normally and says why in its
 * output; one that cannot run at all (the agent is disabled or deleted) fails.
 */
@Injectable()
export class WorkflowAgentEventExecutorRegistrarService {
  constructor(private readonly agentEventRuns: AgentEventRunService) {}

  register(engine: WorkflowEngine): void {
    engine.registerExecutor('agentEventRun', async (node, inputs, context) => {
      const strategyId = readConfigText(node.config, 'strategyId');
      const instruction = readConfigText(node.config, 'instruction');
      if (!strategyId || !instruction) {
        throw new BadRequestException(
          'Choose the agent and say what it should do with the event.',
        );
      }
      const dailyCap = node.config.dailyCap;
      const outcome = await this.agentEventRuns.runForEvent({
        dailyCap: typeof dailyCap === 'number' ? dailyCap : undefined,
        eventId: readInputText(inputs, EVENT_ID_INPUT_KEYS),
        eventText: readInputText(inputs, EVENT_TEXT_INPUT_KEYS) ?? '',
        instruction,
        organizationId: context.organizationId,
        strategyId,
        userId: context.userId,
        workflowExecutionId: context.executionId ?? context.runId,
        workflowId: context.workflowId,
      });
      return describeAgentEventRunOutcome(outcome);
    });
  }
}
