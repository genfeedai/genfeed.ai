import { assertHostNotPrivate } from '@api/shared/utils/ssrf.util';
import { BadRequestException } from '@nestjs/common';

const TRAILING_DOT_PATTERN = /\.$/;
const NUMERIC_LABEL_PATTERN = /^\d+$/;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_ADDRESS_LENGTH = 253;
const INTERNAL_SUFFIXES = [
  '.internal',
  '.local',
  '.localdomain',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
  '.test',
  '.example',
  '.invalid',
] as const;

/**
 * Validates the address of a dedicated instance before it is stored, because
 * the API sends requests to whatever is stored here.
 *
 * Accepted: an `https://` origin with a public DNS name. Everything that could
 * point the API at its own network is refused: IP literals of any kind,
 * single-label and internal names, credentials, a port, a path, a query and a
 * fragment. Returns the normalised origin (no trailing slash).
 *
 * A name can still resolve to a private address later; that is checked where
 * the request is made, not here.
 */
export function normalizeCustomerInstanceAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ADDRESS_LENGTH) {
    throw new BadRequestException('Instance address is not a valid URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('Instance address is not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Instance address must use https');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException(
      'Instance address must not carry credentials',
    );
  }
  if (parsed.port) {
    throw new BadRequestException('Instance address must not set a port');
  }
  if (
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BadRequestException(
      'Instance address must be an origin without a path, query or fragment',
    );
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(TRAILING_DOT_PATTERN, '');
  if (hostname.startsWith('[') || IPV4_PATTERN.test(hostname)) {
    throw new BadRequestException('Instance address must be a DNS name');
  }
  assertHostNotPrivate(hostname);

  const labels = hostname.split('.');
  if (
    labels.length < 2 ||
    !labels.every((label) => DNS_LABEL_PATTERN.test(label)) ||
    NUMERIC_LABEL_PATTERN.test(labels[labels.length - 1] ?? '') ||
    INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new BadRequestException('Instance address must be a public DNS name');
  }

  return `https://${hostname}`;
}
