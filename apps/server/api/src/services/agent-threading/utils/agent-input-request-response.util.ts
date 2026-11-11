import type { AgentTurnAcknowledgement } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import type { AgentInputRequestResponsePayload } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';
import { ForbiddenException } from '@nestjs/common';

const RECURRING_WORKFLOW_REQUEST_PREFIX = 'recurring-workflow:';

export function isRecurringWorkflowRequest(requestId: string): boolean {
  return requestId.startsWith(RECURRING_WORKFLOW_REQUEST_PREFIX);
}

/**
 * A member answering in a thread they do not own may answer any question
 * except a recurring-task draft, which resumes from the owner's runtime state.
 */
export function assertInputRequestAnswerable(
  scope: Pick<ValidatedAgentScope, 'threadOwnerUserId'>,
  isRecurringRequest: boolean,
): void {
  if (isRecurringRequest && scope.threadOwnerUserId) {
    throw new ForbiddenException(
      'Only the thread owner can answer this question.',
    );
  }
}

/**
 * What the continuing turn is told: the picked domain URL for the brand-URL
 * question, otherwise the visible answer.
 */
export function resolveInputContinuationContent(
  fieldId: unknown,
  body: Pick<AgentInputRequestResponsePayload, 'answer' | 'optionIds'>,
): string {
  return fieldId === 'brandUrl' &&
    body.optionIds?.length === 1 &&
    body.optionIds[0].startsWith('https://')
    ? body.optionIds[0]
    : body.answer;
}

export function toInputRequestResponse(
  inputRequest: Record<string, unknown>,
  continuation: AgentTurnAcknowledgement | null,
  threadId: string,
) {
  return {
    answer: inputRequest.answer ?? null,
    executionId: continuation?.executionId ?? null,
    fieldId: inputRequest.fieldId ?? null,
    queuedAt: continuation?.queuedAt ?? null,
    requestId: inputRequest.requestId,
    resolvedAt: inputRequest.resolvedAt ?? null,
    status: inputRequest.status,
    threadId,
  };
}
