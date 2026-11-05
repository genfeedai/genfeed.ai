import { BadRequestException } from '@nestjs/common';

const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//i;
const URL_PATH_START_PATTERN = /[/?#]/;
const HOST_WITH_PORT_PATTERN =
  /^(?:[^:/?#@\s]+\.[^:/?#@\s]+|localhost|\[[0-9a-f:.]+\]):[0-9]+$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /(?:token|secret|signature|credential|password|api[-_]?key|authorization|x-amz|x-goog)|^(?:key|sig|auth)$|^(?:awsaccesskeyid|googleaccessid)/i;

export function normalizeBrandScanUrl(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw new BadRequestException('Invalid scan input');
  const value = input.trim();
  if (
    [...input].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException('Invalid scan URL');
  let url: URL;
  try {
    let canonical = value;
    if (!HTTP_PROTOCOL_PREFIX_PATTERN.test(value)) {
      const authority = value.split(URL_PATH_START_PATTERN)[0] ?? '';
      const hostPort = HOST_WITH_PORT_PATTERN.test(authority);
      if (URL_SCHEME_PATTERN.test(value) && !hostPort)
        throw new Error('Unsupported scheme');
      canonical = `https://${value}`;
    }
    url = new URL(canonical);
  } catch {
    throw new BadRequestException('Invalid scan URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    value.includes('#')
  )
    throw new BadRequestException('Invalid scan URL');
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAM_PATTERN.test(key))
      throw new BadRequestException('Invalid scan URL');
  }
  return url.href;
}
