import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type {
  OAuthAuthorizationRedirect,
  OAuthConnectContext,
} from '@/props/auth/oauth-connect-context.props';

/** sessionStorage key read by `/oauth/[platform]` after provider redirect. */
export const OAUTH_RETURN_TO_STORAGE_KEY = 'oauth_return_to';

/** sessionStorage key read by `/oauth/[platform]` to start a fresh connect. */
export const OAUTH_CONNECT_CONTEXT_STORAGE_KEY = 'oauth_connect_context';

export function rememberOAuthConnectContext(
  context: OAuthConnectContext,
): void {
  if (!isEntityId(context.brandId)) {
    return;
  }

  const credentialId = isEntityId(context.credentialId)
    ? context.credentialId
    : undefined;

  try {
    sessionStorage.setItem(
      OAUTH_CONNECT_CONTEXT_STORAGE_KEY,
      JSON.stringify({
        brandId: context.brandId,
        ...(credentialId ? { credentialId } : {}),
      }),
    );
  } catch {
    // Private mode / blocked storage. The callback can still return home.
  }
}

export function readOAuthConnectContext(): OAuthConnectContext | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_CONNECT_CONTEXT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isEntityId(parsed.brandId)) {
      return null;
    }

    const credentialId = isEntityId(parsed.credentialId)
      ? parsed.credentialId
      : undefined;

    return {
      brandId: parsed.brandId,
      ...(credentialId ? { credentialId } : {}),
    };
  } catch {
    return null;
  }
}

export function clearOAuthConnectContext(): void {
  try {
    sessionStorage.removeItem(OAUTH_CONNECT_CONTEXT_STORAGE_KEY);
  } catch {
    // Private mode / blocked storage: nothing was stored to clear.
  }
}

/**
 * Mirrors the return path into sessionStorage, because the fixed provider
 * redirect URI drops query params before `/oauth/[platform]` reads it.
 */
export function rememberOAuthReturnTo(returnTo: string): void {
  try {
    sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
  } catch {
    // Private mode / blocked storage — the return_to query is best-effort.
  }
}

/**
 * The one way every connect entry point leaves for the provider (#9745):
 * remember where to return and which brand and account the connect is for,
 * then send this tab to the authorization URL with `return_to` appended.
 */
export function redirectToOAuthAuthorization(
  redirect: OAuthAuthorizationRedirect,
): Window | null {
  rememberOAuthReturnTo(redirect.returnTo);
  rememberOAuthConnectContext({
    brandId: redirect.brandId,
    credentialId: redirect.credentialId,
  });
  const separator = redirect.authorizationUrl.includes('?') ? '&' : '?';
  return window.open(
    `${redirect.authorizationUrl}${separator}return_to=${encodeURIComponent(redirect.returnTo)}`,
    '_self',
  );
}
