/**
 * Emitted when a generation output reaches its billing terminal: its hold is
 * settled (the output was delivered) or released (it failed or timed out).
 * This is the media completion contract every provider path goes through.
 * Payload: `GenerationOutputTerminalEvent`.
 */
export const GENERATION_OUTPUT_TERMINAL_EVENT = 'generation.output.terminal';

export interface GenerationOutputTerminalEvent {
  ingredientId: string;
  organizationId: string;
  outcome: 'released' | 'settled';
}
