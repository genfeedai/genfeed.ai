/** How one `onboard_brand` action maps onto an onboarding agent tool. */
export interface OnboardBrandActionConfig {
  agentToolName: string;
  /** Arguments forwarded to the agent tool; every other argument is dropped. */
  fields: readonly string[];
  /** Proxy budget for actions slower than the client default. */
  timeoutMs?: number;
}

/** The agent tool call an `onboard_brand` action resolves to. */
export interface OnboardBrandAgentCall {
  agentToolName: string;
  parameters: Record<string, unknown>;
  timeoutMs?: number;
}
