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
  prompt?: unknown,
): string {
  // The option label alone (for example “Approve and generate”) loses the brief.
  // Keep it in user content. Only a server-owned tool approval authorizes dispatch.
  if (
    !fieldId &&
    body.optionIds?.length &&
    typeof prompt === 'string' &&
    prompt.trim()
  )
    return `Question: ${prompt}\nSelected answer: ${body.answer}`;
  return fieldId === 'brandUrl' &&
    body.optionIds?.length === 1 &&
    body.optionIds[0].startsWith('https://')
    ? body.optionIds[0]
    : body.answer;
}

/**
 * An answered question's continuation belongs to whoever answered first. A
 * different authorized caller (the owner repairing a delivery gap) reuses it
 * rather than starting a second one (#10029). Empty keeps the caller's own
 * identity, including for answers recorded before the responder was stored.
 */
export function resolveContinuationIdempotency(
  inputRequest: Record<string, unknown>,
  callerUserId: string,
): { idempotencyUserId?: string } {
  const answeredBy = inputRequest.resolvedByUserId;
  return typeof answeredBy === 'string' && answeredBy !== callerUserId
    ? { idempotencyUserId: answeredBy }
    : {};
}

/**
 * The answer continues on a new execution. Returning it lets the client pin
 * its stream to that run instead of the one that asked.
 */
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
