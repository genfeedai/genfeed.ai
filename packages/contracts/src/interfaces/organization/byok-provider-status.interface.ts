export interface IByokProviderStatus {
  provider: string;
  label: string;
  description: string;
  docsUrl: string;
  isEnabled: boolean;
  hasKey: boolean;
  maskedKey: string | null;
  lastValidatedAt?: string;
  requiresSecret?: boolean;
  /** Whether this provider supports OAuth login (e.g., OpenAI Codex) */
  supportsOAuth?: boolean;
  /** Current auth mode if key is set */
  authMode?: 'api_key' | 'oauth';
  /** Total number of API requests made with this key */
  totalRequests?: number;
  /** Timestamp of the last API request made with this key */
  lastUsedAt?: string | null;
}
