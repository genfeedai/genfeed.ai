import type {
  OnboardBrandActionConfig,
  OnboardBrandAgentCall,
} from '@mcp/shared/interfaces/onboarding.interface';

/** MCP-surfaced onboarding tools resolved onto in-app agent tools (#6268). */
export const ONBOARDING_TOOL_NAMES: ReadonlySet<string> = new Set([
  'onboard_brand',
]);

/**
 * The API caps a brand scan at 45 s (`SignupPrefillService`); the proxy waits
 * longer so the result gate also fits and a scan that lands is never reported
 * to the agent as a timeout.
 */
export const ONBOARD_BRAND_SCAN_TIMEOUT_MS = 75_000;

const ONBOARD_BRAND_ACTIONS = {
  complete: { agentToolName: 'complete_onboarding', fields: [] },
  save_answers: {
    agentToolName: 'save_onboarding_answers',
    fields: ['brandId', 'goals', 'platforms', 'cadence', 'toneAdjustment'],
  },
  scan_url: {
    agentToolName: 'scan_brand_url',
    fields: ['brandId', 'url'],
    timeoutMs: ONBOARD_BRAND_SCAN_TIMEOUT_MS,
  },
} as const satisfies Record<string, OnboardBrandActionConfig>;

type OnboardBrandAction = keyof typeof ONBOARD_BRAND_ACTIONS;

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

  const config: OnboardBrandActionConfig = ONBOARD_BRAND_ACTIONS[action];
  const parameters: Record<string, unknown> = {};
  for (const field of config.fields) {
    if (args[field] !== undefined) {
      parameters[field] = args[field];
    }
  }
  return {
    agentToolName: config.agentToolName,
    parameters,
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  };
}
