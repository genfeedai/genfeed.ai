/**
 * Stable wire codes for `POST /services/youtube/verify`.
 *
 * The callback UI maps these codes to localized copy. Values are a contract:
 * do not rename them, and do not put tokens, OAuth codes, or provider bodies
 * in the response that carries one.
 */
export enum YoutubeOAuthVerifyErrorCode {
  /** The provider callback reported access_denied or user_denied. */
  ACCESS_DENIED = 'youtube_access_denied',
  /** The authorization finished without a usable connection. */
  AUTHORIZATION_FAILED = 'youtube_authorization_failed',
  /** The Google identity has no YouTube channel or Brand Account. */
  CHANNEL_MISSING = 'youtube_channel_missing',
  /** YouTube refused the call because a required scope was not granted. */
  MISSING_SCOPES = 'youtube_missing_scopes',
  /** YouTube or the network failed while verifying the channel. */
  PROVIDER_FAILURE = 'youtube_provider_failure',
  /** The OAuth state is missing or no longer matches a pending credential. */
  STATE_INVALID = 'youtube_state_invalid',
  /** Google rejected or did not complete the authorization-code exchange. */
  TOKEN_EXCHANGE_FAILED = 'youtube_token_exchange_failed',
  /** Unclassified failure. The response stays generic and token-free. */
  UNKNOWN = 'youtube_unknown',
}
