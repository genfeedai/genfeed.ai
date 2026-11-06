import {
  ApiKeyConnectErrorCode,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { getJsonApiErrorMember } from '@genfeedai/services/core/json-api-error-message';
import type { ApiKeyConnectFormFields } from '@props/pages/brand-integrations.props';

const API_KEY_ONLY: ApiKeyConnectFormFields = {
  hasPublicationId: false,
  hasSiteUrl: false,
};

const API_KEY_CONNECT_FORM_FIELDS: Partial<
  Record<CredentialPlatform, ApiKeyConnectFormFields>
> = {
  [CredentialPlatform.BEEHIIV]: { hasPublicationId: true, hasSiteUrl: false },
  [CredentialPlatform.GHOST]: { hasPublicationId: false, hasSiteUrl: true },
};

/** The inputs a key form shows for a platform; the key alone by default. */
export function getApiKeyConnectFormFields(
  platform: CredentialPlatform,
): ApiKeyConnectFormFields {
  return API_KEY_CONNECT_FORM_FIELDS[platform] ?? API_KEY_ONLY;
}

/**
 * `apiKeyConnect.errors.*` message for each reason the server names. Keyed by
 * the wire string, so a code this client does not know falls through.
 */
const ERROR_MESSAGE_KEYS = new Map<string, string>([
  [ApiKeyConnectErrorCode.API_NOT_FOUND, 'apiNotFound'],
  [ApiKeyConnectErrorCode.HTTPS_REQUIRED, 'httpsRequired'],
  [ApiKeyConnectErrorCode.INVALID_KEY_FORMAT, 'invalidKeyFormat'],
  [ApiKeyConnectErrorCode.INVALID_URL, 'invalidUrl'],
  [ApiKeyConnectErrorCode.KEY_REJECTED, 'keyRejected'],
  [ApiKeyConnectErrorCode.PUBLICATION_NOT_FOUND, 'publicationNotFound'],
  [ApiKeyConnectErrorCode.SITE_REDIRECTED, 'siteRedirected'],
  [ApiKeyConnectErrorCode.SITE_UNREACHABLE, 'siteUnreachable'],
]);

/**
 * The `apiKeyConnect.*` message key that explains a failed connect: the
 * specific reason when the server named one, the generic retry otherwise.
 */
export function resolveApiKeyConnectErrorMessageKey(error: unknown): string {
  const code = getJsonApiErrorMember(error)?.code;
  const key = code ? ERROR_MESSAGE_KEYS.get(code) : undefined;
  return key ? `errors.${key}` : 'connectError';
}
