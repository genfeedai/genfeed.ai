export interface IByokKeyEntry {
  provider: string;
  apiKey: string;
  apiSecret?: string;
  isEnabled: boolean;
  lastValidatedAt?: Date;
  /** OAuth mode: 'api_key' (default) or 'oauth' */
  authMode?: 'api_key' | 'oauth';
  /** OAuth access token expiry (ms since epoch) */
  expiresAt?: number;
  /** OAuth account ID (e.g., org-xxx from OpenAI) */
  oauthAccountId?: string;
  /** Total number of API requests made with this key */
  totalRequests?: number;
  /** Timestamp of the last API request made with this key */
  lastUsedAt?: Date | null;
}
