/**
 * TikTok Business API code for "Access token is incorrect or has been
 * revoked". The advertiser has to authorize again; retrying cannot help.
 */
export const TIKTOK_ADS_INVALID_ACCESS_TOKEN_CODE = 40105;

/**
 * The provider rejected the stored access token. It carries the provider code
 * and request id only, never the token, so it is safe to log.
 */
export class TikTokAdsAuthorizationError extends Error {
  readonly code: number;
  readonly requestId: string;

  constructor(code: number, message: string, requestId: string) {
    super(`TikTok API error ${code}: ${message} (request_id: ${requestId})`);
    this.name = 'TikTokAdsAuthorizationError';
    this.code = code;
    this.requestId = requestId;
  }
}

export function isTikTokAdsAuthorizationError(
  error: unknown,
): error is TikTokAdsAuthorizationError {
  return error instanceof TikTokAdsAuthorizationError;
}
