import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';

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
