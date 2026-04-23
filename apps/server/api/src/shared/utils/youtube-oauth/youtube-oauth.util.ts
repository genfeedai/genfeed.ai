import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

export interface YoutubeOAuthClient extends OAuth2Client {
  clientId?: string;
  redirectUri?: string;
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
    ) as YoutubeOAuthClient;
  }
}
