/**
 * Every planning attempt came back without any visible text. Carries only
 * sanitized diagnostics (no prompt, no model output) so the failure groups
 * apart from audio-extraction and actor-membership failures.
 */
export class AgentPlannerEmptyPlanError extends Error {
  readonly attempts: number;
  readonly finishReason: string | null;
  readonly model: string;

  constructor(input: {
    attempts: number;
    finishReason: string | null;
    model: string;
  }) {
    super('The planner returned an empty plan. Send the request again.');
    this.name = 'AgentPlannerEmptyPlanError';
    this.attempts = input.attempts;
    this.finishReason = input.finishReason;
    this.model = input.model;
  }
}
