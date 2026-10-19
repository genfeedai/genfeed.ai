/**
 * Sent on the last round the turn may spend. The model keeps its tool
 * definitions (the history is full of tool calls) but is told not to call
 * them, so a turn that used its whole budget on research still ends with an
 * answer instead of a hard failure.
 */
export const AGENT_WRAP_UP_INSTRUCTION =
  'You have used your tool-calling budget for this turn. Do not call any more tools. Reply now with a final answer built from the results you already have, and say plainly what you could not finish.';

/** The final allowed round is the wrap-up round; a zero budget has none. */
export function isAgentWrapUpRound(
  round: number,
  maximumRounds: number,
): boolean {
  return maximumRounds > 0 && round === maximumRounds;
}
