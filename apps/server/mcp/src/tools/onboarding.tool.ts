/** MCP-surfaced onboarding tools resolved onto in-app agent tools (#6268). */
export const ONBOARDING_TOOL_NAMES: ReadonlySet<string> = new Set([
  'onboard_brand',
]);

const ONBOARD_BRAND_ACTIONS = {
  complete: { agentToolName: 'complete_onboarding', fields: [] },
  save_answers: {
    agentToolName: 'save_onboarding_answers',
    fields: ['brandId', 'goals', 'platforms', 'cadence', 'toneAdjustment'],
  },
  scan_url: { agentToolName: 'scan_brand_url', fields: ['brandId', 'url'] },
} as const satisfies Record<
  string,
  { agentToolName: string; fields: readonly string[] }
>;

type OnboardBrandAction = keyof typeof ONBOARD_BRAND_ACTIONS;

export interface OnboardBrandAgentCall {
  agentToolName: string;
  parameters: Record<string, unknown>;
}

function isOnboardBrandAction(value: unknown): value is OnboardBrandAction {
  return (
    typeof value === 'string' && Object.hasOwn(ONBOARD_BRAND_ACTIONS, value)
  );
}

/**
 * Map an `onboard_brand` call onto the agent tool that runs it, forwarding
 * only the fields that action accepts. The agent tools own validation and
 * tenant scoping; this only routes.
 */
export function resolveOnboardBrandCall(
  args: Record<string, unknown>,
): OnboardBrandAgentCall {
  const { action } = args;
  if (!isOnboardBrandAction(action)) {
    throw new Error(
      `onboard_brand action must be one of: ${Object.keys(ONBOARD_BRAND_ACTIONS).join(', ')}`,
    );
  }

  const { agentToolName, fields } = ONBOARD_BRAND_ACTIONS[action];
  const parameters: Record<string, unknown> = {};
  for (const field of fields) {
    if (args[field] !== undefined) {
      parameters[field] = args[field];
    }
  }
  return { agentToolName, parameters };
}
