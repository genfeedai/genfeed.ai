import { AgentEventRunService } from '@api/services/agent-event-run/agent-event-run.service';
import { AgentUntrustedContentGateService } from '@api/services/agent-orchestrator/agent-untrusted-content-gate.service';
import { WORKFLOW_TRIGGER_EVENT_CONTENT_NAME } from '@genfeedai/contracts/interfaces';
import { Injectable, OnModuleInit } from '@nestjs/common';

/**
 * Gives the workflow step that starts an agent run from an event the same
 * injection check agent tool results get. The classifier lives with the
 * orchestrator, which imports the workflows module, so the step cannot import
 * it back: this binds it once both exist. Where the orchestrator is not loaded
 * the step runs on the fence and the cleaning alone, like a gate that is off.
 */
@Injectable()
export class AgentEventContentGateBinderService implements OnModuleInit {
  constructor(
    private readonly agentEventRuns: AgentEventRunService,
    private readonly gate: AgentUntrustedContentGateService,
  ) {}

  onModuleInit(): void {
    this.agentEventRuns.bindContentGate({
      isWithheld: async (input) => {
        const result = await this.gate.evaluateToolResult({
          content: input.content,
          context: {
            executionId: input.executionId,
            organizationId: input.organizationId,
            strategyId: input.strategyId,
            userId: input.userId,
          },
          origin: 'agent',
          toolCallId: input.eventKey,
          toolName: WORKFLOW_TRIGGER_EVENT_CONTENT_NAME,
        });
        return result.outcome === 'withheld';
      },
    });
  }
}
