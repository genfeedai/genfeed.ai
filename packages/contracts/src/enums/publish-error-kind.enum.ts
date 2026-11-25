/**
 * What a publisher says went wrong with a publish. The set is closed: the
 * pipeline acts on the kind and never reads the provider's message text.
 */
export enum PublishErrorKind {
  /** The access token is expired or invalid; refreshing it can fix this. */
  TOKEN_MUST_REFRESH = 'token_must_refresh',
  /** The provider refused for now and nothing was published; try again later. */
  RETRY_LATER = 'retry_later',
  /** The provider rate limited the request; wait until its stated reset. */
  RATE_LIMITED = 'rate_limited',
  /** The provider rejected the content; retrying can never succeed. */
  CONTENT_REJECTED = 'content_rejected',
  /** The grant is revoked or the account is gone; the owner must reconnect. */
  CHANNEL_DISCONNECTED = 'channel_disconnected',
  /** The request may have reached the provider; verify before any retry. */
  OUTCOME_UNKNOWN = 'outcome_unknown',
  /**
   * The provider account Genfeed publishes through is out of credits. Nothing
   * was published, and a retry cannot succeed until an operator adds credits.
   */
  PROVIDER_CREDITS_DEPLETED = 'provider_credits_depleted',
}
