import { createHash, timingSafeEqual } from 'node:crypto';

const PLUS_SIGNS_PATTERN = /\+/g;
const SLASHES_PATTERN = /\//g;
const BASE64_PADDING_PATTERN = /=+$/;

export function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(PLUS_SIGNS_PATTERN, '-')
    .replace(SLASHES_PATTERN, '_')
    .replace(BASE64_PADDING_PATTERN, '');
}

export function buildCodeChallenge(verifier: string): string {
  return toBase64Url(createHash('sha256').update(verifier).digest());
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
