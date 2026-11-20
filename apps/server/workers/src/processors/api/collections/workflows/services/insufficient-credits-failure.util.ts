const AGENT_TURN_CANONICAL_ID = 'agent.turn.execute';

// A graph run flattens node errors into `Nodes failed: <node>: <message>`.
// Only a single failed node counts, so a turn that failed for another reason
// besides credits is still reported.
const SINGLE_NODE_INSUFFICIENT_CREDITS_PATTERN =
  /^Nodes failed: [\w.-]+: Insufficient credits\b(?!.*, [\w.-]+: )/s;

/**
 * Whether a failed system run is an agent turn that stopped because the
 * organization has too few credits. That is an ordinary user state: the turn's
 * own `fail-turn` node already recorded the reason on the thread, and a retry
 * cannot add credits, so it is not an error worth a Sentry group.
 */
export function isAgentTurnInsufficientCredits(
  canonicalId: string,
  message: string | undefined,
): boolean {
  return (
    canonicalId === AGENT_TURN_CANONICAL_ID &&
    message !== undefined &&
    SINGLE_NODE_INSUFFICIENT_CREDITS_PATTERN.test(message)
  );
}
