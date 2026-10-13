import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type { OAuthConnectContext } from '@props/auth/oauth-connect-context.props';

/** sessionStorage key read by `/oauth/[platform]` to start a fresh connect. */
export const OAUTH_CONNECT_CONTEXT_STORAGE_KEY = 'oauth_connect_context';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
