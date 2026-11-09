import type {
  AgentStreamEntry,
  AgentStreamPhase,
  AgentStreamPhaseInput,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

/**
 * Names the phase a stream entry is in (#9737). The entry still holds its
 * state in refs and flags; this reads them in one place so the phases in
 * `docs/architecture/agent-chat-stream-phases.md` can be asserted, and so a
 * later reducer has a tested target. Earlier rows win.
 */
export function deriveAgentStreamPhase(
  input: AgentStreamPhaseInput,
): AgentStreamPhase {
  if (input.isTerminal) return 'terminal';
  if (input.isAwaitingRunId) return 'awaiting_run_id';
  if (input.isRunStalled) return 'stalled';
  if (input.hasPendingCompletion) return 'streaming';
  if (input.hasPendingInputRequest) return 'awaiting_input';
  return 'idle';
}

export function readAgentStreamPhase(
  entry: AgentStreamEntry,
): AgentStreamPhase {
  const presentation = entry.presentation.getState();
  return deriveAgentStreamPhase({
    hasPendingCompletion: entry.pendingCompletionRef.current !== null,
    hasPendingInputRequest: presentation.pendingInputRequest !== null,
    isAwaitingRunId: entry.isAwaitingRunIdRef.current,
    isRunStalled: presentation.stream.isRunStalled === true,
    isTerminal: entry.terminalAt !== null,
  });
}
