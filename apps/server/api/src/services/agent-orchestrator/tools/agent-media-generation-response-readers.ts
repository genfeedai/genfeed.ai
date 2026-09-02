import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type { JsonApiResult } from '@genfeedai/contracts/interfaces';

const LOCAL_ASSET_PATH_PREFIX = '/local/';
const PRIVATE_ASSET_QUERY_PARAMETER_PATTERN =
  /^(?:awsaccesskeyid|signature|x-amz-(?:credential|security-token|signature))$/i;

export function isPlainMediaResponseRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function readMediaResponseString(
  response: Record<string, unknown>,
  key: string,
): string | undefined {
  const data = isPlainMediaResponseRecord(response.data)
    ? response.data
    : undefined;
  const attributes = isPlainMediaResponseRecord(data?.attributes)
    ? data.attributes
    : undefined;
  return readOptionalString(attributes?.[key] ?? data?.[key] ?? response[key]);
}

export function readArticleResource(
  response: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const payload = response.data ?? response;

  if (Array.isArray(payload)) {
    const first = payload[0];
    return isPlainMediaResponseRecord(first) ? first : undefined;
  }

  return isPlainMediaResponseRecord(payload) ? payload : undefined;
}

/**
 * Adapt a typed JSON:API payload from the in-process generation gateway to the
 * loose record shape every reader in this file consumes.
 */
export function toMediaResponseRecord(
  response: JsonApiResult,
): Record<string, unknown> {
  return isPlainMediaResponseRecord(response) ? response : { data: null };
}

export function readMediaAssetUrl(
  response: Record<string, unknown>,
  ingredientsEndpoint: string,
): string | undefined {
  const explicitUrl =
    readMediaResponseString(response, 'cdnUrl') ??
    readMediaResponseString(response, 'ingredientUrl') ??
    readMediaResponseString(response, 'url');

  if (explicitUrl) {
    return explicitUrl;
  }

  const s3Key = readMediaResponseString(response, 's3Key');
  if (!s3Key) {
    // An id is a gallery identifier, not a renderable URL. Never invent a
    // gallery path here or chat renders a blank media preview.
    return undefined;
  }

  const cdnBaseUrl = ingredientsEndpoint.replace(/\/ingredients\/?$/, '');
  return `${cdnBaseUrl}/${s3Key.replace(/^\/+/, '')}`;
}

export function readUsableCdnAssetUrl(
  response: Record<string, unknown>,
  ingredientsEndpoint: string,
): string | undefined {
  const explicitCandidates = [
    readMediaResponseString(response, 'cdnUrl'),
    readMediaResponseString(response, 'ingredientUrl'),
    readMediaResponseString(response, 'url'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of explicitCandidates) {
    if (isUsableAssetUrl(candidate, ingredientsEndpoint)) {
      return candidate;
    }
  }
  if (explicitCandidates.length > 0) {
    return undefined;
  }

  const s3Key = readMediaResponseString(response, 's3Key');
  if (!s3Key) {
    return undefined;
  }
  const cdnBaseUrl = ingredientsEndpoint.replace(/\/ingredients\/?$/, '');
  const derivedUrl = `${cdnBaseUrl}/${s3Key.replace(/^\/+/, '')}`;
  return isUsableAssetUrl(derivedUrl, ingredientsEndpoint)
    ? derivedUrl
    : undefined;
}

export function isAwsS3PublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const chinaSuffix = '.amazonaws.com.cn';
  const commercialSuffix = '.amazonaws.com';
  const suffix = host.endsWith(chinaSuffix)
    ? chinaSuffix
    : host.endsWith(commercialSuffix)
      ? commercialSuffix
      : undefined;
  if (!suffix) {
    return false;
  }

  const rest = host.slice(0, -suffix.length);
  if (rest.length === 0) {
    return false;
  }

  for (const label of rest.split('.')) {
    if (label === 's3' || (label.startsWith('s3-') && label.length > 3)) {
      return true;
    }
  }
  return false;
}

function isUsableAssetUrl(
  candidate: string,
  ingredientsEndpoint: string,
): boolean {
  if (candidate.startsWith(LOCAL_ASSET_PATH_PREFIX)) {
    try {
      const localUrl = new URL(candidate, 'http://local.genfeed.invalid');
      return (
        localUrl.pathname.startsWith(LOCAL_ASSET_PATH_PREFIX) &&
        localUrl.pathname.length > LOCAL_ASSET_PATH_PREFIX.length
      );
    } catch {
      return false;
    }
  }

  try {
    const assetUrl = new URL(candidate);
    const configuredCdnUrl = new URL(ingredientsEndpoint);
    const isConfiguredOrigin = assetUrl.origin === configuredCdnUrl.origin;
    const isAllowedProtocol =
      assetUrl.protocol === 'https:' ||
      (assetUrl.protocol === 'http:' && isConfiguredOrigin);
    const isTrustedStorageOrigin =
      isConfiguredOrigin || isAwsS3PublicHost(assetUrl.hostname);
    const hasAssetPath = assetUrl.pathname !== '/';
    const hasNoEmbeddedCredentials = !assetUrl.username && !assetUrl.password;
    const hasNoPrivateQueryParameters = Array.from(
      assetUrl.searchParams.keys(),
    ).every((key) => !PRIVATE_ASSET_QUERY_PARAMETER_PATTERN.test(key));

    return (
      isAllowedProtocol &&
      isTrustedStorageOrigin &&
      hasAssetPath &&
      hasNoEmbeddedCredentials &&
      hasNoPrivateQueryParameters
    );
  } catch {
    return false;
  }
}
