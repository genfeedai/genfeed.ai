export interface ByokResolutionResult {
  apiKey?: string;
  apiSecret?: string;
  source: 'byok' | 'hosted';
}
