export interface AgentRuntimeOption {
  key: string;
  label: string;
  description: string;
  /** Billing/execution note shown with the option (e.g. subscription runtimes). */
  hint?: string;
  requestedModel: string;
  category: 'auto' | 'hosted' | 'local';
  provider?: 'genfeed' | 'openrouter' | 'replicate' | 'claude' | 'codex';
}

export interface AgentRuntimeCatalog {
  environmentLabel: 'cloud' | 'local';
  providerSummary: string;
  localToolSummary: string;
  options: AgentRuntimeOption[];
}
