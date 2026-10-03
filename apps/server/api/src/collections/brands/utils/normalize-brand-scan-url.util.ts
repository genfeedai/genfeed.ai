import { BadRequestException } from '@nestjs/common';

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
    if (!/^https?:\/\//i.test(value)) {
      const authority = value.split(/[/?#]/)[0] ?? '';
      const hostPort =
        /^(?:[^:/?#@\s]+\.[^:/?#@\s]+|localhost|\[[0-9a-f:.]+\]):[0-9]+$/i.test(
          authority,
        );
      if (/^[a-z][a-z\d+.-]*:/i.test(value) && !hostPort)
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
    if (
      /(?:token|secret|signature|credential|password|api[-_]?key|authorization|x-amz|x-goog)|^(?:key|sig|auth)$|^(?:awsaccesskeyid|googleaccessid)/i.test(
        key,
      )
    )
      throw new BadRequestException('Invalid scan URL');
  }
  return url.href;
}
