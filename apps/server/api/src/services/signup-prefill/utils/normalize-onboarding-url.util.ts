import { BadRequestException } from '@nestjs/common';

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
    if (!/^https?:\/\//i.test(value)) {
      const authority = value.split(/[/?#]/)[0] ?? '';
      const hasHostPort =
        /^(?:[^:/?#@\s]+\.[^:/?#@\s]+|localhost|\[[0-9a-f:.]+\]):[0-9]+$/i.test(
          authority,
        );
      if (/^[a-z][a-z\d+.-]*:/i.test(value) && !hasHostPort)
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
