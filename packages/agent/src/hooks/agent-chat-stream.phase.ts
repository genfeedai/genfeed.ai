import type {
  AgentStreamEntry,
  AgentStreamPhase,
  AgentStreamPhaseEvent,
  AgentStreamPhaseInput,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

const EVERY_PHASE: readonly AgentStreamPhase[] = [
  'idle',
  'awaiting_run_id',
  'streaming',
  'awaiting_input',
  'stalled',
  'terminal',
];

const LIVE_PHASES: readonly AgentStreamPhase[] = [
  'idle',
  'awaiting_run_id',
  'streaming',
  'awaiting_input',
  'stalled',
];

/**
 * Legal phase changes of one thread's stream (#9737). An event raised in a
 * phase it does not list leaves the phase as it is. See
 * `docs/architecture/agent-chat-stream-phases.md`.
 */
export const AGENT_STREAM_PHASE_TRANSITIONS: Readonly<
  Record<
    AgentStreamPhaseEvent,
    { from: readonly AgentStreamPhase[]; to: AgentStreamPhase }
  >
> = {
  /** A send holds the thread's events until its run is named. */
  send: { from: EVERY_PHASE, to: 'awaiting_run_id' },
  /** Answering an input request holds events until the continuation. */
  handoff: { from: EVERY_PHASE, to: 'awaiting_run_id' },
  /** Acknowledgement, adoption, a queued ui-action run or a restore. */
  run_named: { from: LIVE_PHASES, to: 'streaming' },
  /** Nothing will name the run, so stop holding events for it. */
  hold_released: { from: ['awaiting_run_id'], to: 'idle' },
  input_requested: {
    from: ['idle', 'streaming', 'stalled'],
    to: 'awaiting_input',
  },
  /** The execution lookup kept returning 404 after the grace period. */
  stall: { from: ['streaming'], to: 'stalled' },
  /** The user chose to keep waiting on a stalled run. */
  resume: { from: ['stalled'], to: 'streaming' },
  /** The transcript was cleared. */
  reset: { from: LIVE_PHASES, to: 'idle' },
  /** Done, error, recovery, abandon, or a handoff with nothing pending. */
  settle: { from: EVERY_PHASE, to: 'terminal' },
};

export function reduceAgentStreamPhase(
  phase: AgentStreamPhase,
  event: AgentStreamPhaseEvent,
): AgentStreamPhase {
  const transition = AGENT_STREAM_PHASE_TRANSITIONS[event];
  return transition.from.includes(phase) ? transition.to : phase;
}

export function transitionAgentStreamPhase(
  entry: Pick<AgentStreamEntry, 'phase'>,
  event: AgentStreamPhaseEvent,
): void {
  entry.phase = reduceAgentStreamPhase(entry.phase, event);
}

export function isAgentStreamAwaitingRunId(
  entry: Pick<AgentStreamEntry, 'phase'>,
): boolean {
  return entry.phase === 'awaiting_run_id';
}

/**
 * Reads the phase back from the fields the stream keeps beside it. Earlier
 * rows win. The phase spec checks it against `entry.phase` after every step,
 * so the reducer and the fields cannot drift apart unnoticed.
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
    isAwaitingRunId: isAgentStreamAwaitingRunId(entry),
    isRunStalled: presentation.stream.isRunStalled === true,
    isTerminal: entry.terminalAt !== null,
  });
}
