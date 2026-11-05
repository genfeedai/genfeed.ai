import { BadRequestException } from '@nestjs/common';

const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//i;
const URL_PATH_START_PATTERN = /[/?#]/;
const HOST_WITH_PORT_PATTERN =
  /^(?:[^:/?#@\s]+\.[^:/?#@\s]+|localhost|\[[0-9a-f:.]+\]):[0-9]+$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/** Preserve public page paths and queries; fragments are never fetched. */
export function normalizeOnboardingUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw new BadRequestException('Invalid scan URL');
  if (
    [...input].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException('Invalid scan URL');
  const value = input.trim();
  let url: URL;
  try {
    let canonical = value;
    if (!HTTP_PROTOCOL_PREFIX_PATTERN.test(value)) {
      const authority = value.split(URL_PATH_START_PATTERN)[0] ?? '';
      const hasHostPort = HOST_WITH_PORT_PATTERN.test(authority);
      if (URL_SCHEME_PATTERN.test(value) && !hasHostPort)
        throw new BadRequestException('Invalid scan URL');
      canonical = `https://${value}`;
    }
    url = new URL(canonical);
  } catch {
    throw new BadRequestException('Invalid scan URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new BadRequestException('URL must be a public HTTP(S) page');
  url.hash = '';
  return url.href;
}
