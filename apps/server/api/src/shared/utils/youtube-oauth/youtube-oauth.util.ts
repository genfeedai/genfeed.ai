import { google } from 'googleapis';

export interface YoutubeOAuthClient {
  clientId?: string;
  redirectUri?: string;
  credentials?: {
    access_token?: string | null;
    expiry_date?: number | null;
    refresh_token?: string | null;
  };
  getAccessToken: (...args: unknown[]) => Promise<unknown>;
  getToken: (...args: unknown[]) => unknown;
  setCredentials: (...args: unknown[]) => unknown;
}

/**
 * YouTube OAuth2 Utility
 *
 * Provides a centralized way to create OAuth2 clients for YouTube integration.
 * This avoids duplication of OAuth2 client instantiation across the codebase.
 *
 * Usage:
 * ```typescript
 * const oauth2Client = YoutubeOAuth2Util.createClient(
 *   clientId,
 *   clientSecret,
 *   redirectUri
 * );
 * ```
 */
export class YoutubeOAuth2Util {
  /**
   * Create a new Google OAuth2 client configured for YouTube
   *
   * @param clientId - YouTube OAuth2 client ID
   * @param clientSecret - YouTube OAuth2 client secret
   * @param redirectUri - OAuth2 redirect URI
   * @returns Configured OAuth2 client instance
   */
  static createClient(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): YoutubeOAuthClient {
    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    ) as unknown as YoutubeOAuthClient;
  }
}
