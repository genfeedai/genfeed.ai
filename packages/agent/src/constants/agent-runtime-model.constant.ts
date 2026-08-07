/**
 * Client no longer hard-codes a default model key. The selected model is set
 * from the registry default (`useAgentRegistryModels.defaultModelKey`) once
 * the list loads. An empty string means "not resolved yet".
 */
export const UNRESOLVED_RUNTIME_AGENT_MODEL = '';
