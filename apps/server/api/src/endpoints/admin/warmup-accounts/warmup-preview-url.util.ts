import { creatorInvitePath } from '@genfeedai/contracts/constants';

/**
 * Where an install without `GENFEEDAI_PUBLIC_URL` points preview links. The
 * endpoint keeps this fallback; a non-production install that lacks the
 * variable is reported by the self-hosted readiness checks instead
 * (`findSelfHostedConfigIssues`), before any invite is sent.
 */
const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * The lead's locked profile on the public site. The handle alone answers 404
 * while the brand is private; only the token opens the locked view. A
 * configured origin is kept as written apart from surrounding whitespace and
 * trailing slashes, and the token is never altered.
 */
export function buildPreviewInviteUrl(
  configuredOrigin: unknown,
  handle: string,
  token: string,
): string {
  const configured =
    typeof configuredOrigin === 'string'
      ? stripTrailingSlashes(configuredOrigin.trim())
      : '';
  const base = configured.length > 0 ? configured : DEFAULT_WEBSITE_URL;
  return `${base}${creatorInvitePath(handle, token)}`;
}
