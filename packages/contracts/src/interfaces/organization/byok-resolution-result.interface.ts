export interface ByokResolutionResult {
  apiKey?: string;
  apiSecret?: string;
  managedInferenceUrl?: string;
  source: 'byok' | 'hosted' | 'managed';
}
