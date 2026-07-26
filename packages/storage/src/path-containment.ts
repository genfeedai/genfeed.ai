import path from 'node:path';

/** Factory that turns a validation message into a consumer-owned error. */
export type SecurityErrorFactory = (message: string) => Error;

/**
 * A traversal-free path or object-key segment.
 *
 * The additional `includes('..')` check in {@link assertSafeSegment} rejects
 * ambiguous dot sequences even though single dots are otherwise valid.
 */
export const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeSegment(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
): string {
  if (
    typeof value !== 'string' ||
    !SAFE_SEGMENT_PATTERN.test(value) ||
    value.includes('..')
  ) {
    throw createError(
      `${name} must be a single path segment of letters, digits, '.', '-' or '_'`,
    );
  }

  return value;
}

/**
 * Resolve a candidate and assert that it remains equal to or below a fixed
 * filesystem root.
 */
export function resolveContainedPath(
  rootDir: string,
  candidatePath: string,
  createError: SecurityErrorFactory,
): string {
  if (!rootDir || typeof rootDir !== 'string') {
    throw createError('Containment root is not configured');
  }

  if (!candidatePath || typeof candidatePath !== 'string') {
    throw createError('File path is required and must be a string');
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, candidatePath);

  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw createError(`File path must stay within ${resolvedRoot}`);
  }

  return resolved;
}

function validateObjectKey(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
  allowTrailingSlash: boolean,
): string {
  if (!value || typeof value !== 'string') {
    throw createError(`${name} is required and must be a string`);
  }

  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw createError(`${name} must be a relative POSIX object key`);
  }

  const normalized =
    allowTrailingSlash && value.endsWith('/') ? value.slice(0, -1) : value;
  const segments = normalized.split('/');

  if (
    !normalized ||
    (!allowTrailingSlash && value.endsWith('/')) ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw createError(`${name} contains an invalid path segment`);
  }

  return normalized;
}

/** Validate a relative POSIX object key without imposing an owning prefix. */
export function assertSafeObjectKey(
  key: string,
  createError: SecurityErrorFactory,
): string {
  validateObjectKey(key, 'Object key', createError, false);
  return key;
}

/** Validate an object-listing prefix, preserving an empty bucket-root prefix. */
export function assertSafeObjectKeyPrefix(
  prefix: string,
  createError: SecurityErrorFactory,
): string {
  if (prefix === '') {
    return prefix;
  }
  validateObjectKey(prefix, 'Object key prefix', createError, true);
  return prefix;
}

/**
 * Construct a literal S3 key below a fixed prefix without normalizing or
 * rewriting the candidate key.
 */
export function resolveContainedObjectKey(
  prefix: string,
  candidateKey: string,
  createError: SecurityErrorFactory,
): string {
  const normalizedPrefix = validateObjectKey(
    prefix,
    'Object key prefix',
    createError,
    true,
  );
  const validatedCandidate = validateObjectKey(
    candidateKey,
    'Object key',
    createError,
    false,
  );

  return `${normalizedPrefix}/${validatedCandidate}`;
}

/**
 * Validate an already-built object key under a fixed prefix while preserving
 * the key byte-for-byte.
 */
export function assertObjectKeyWithinPrefix(
  prefix: string,
  key: string,
  createError: SecurityErrorFactory,
): string {
  const normalizedPrefix = validateObjectKey(
    prefix,
    'Object key prefix',
    createError,
    true,
  );
  const validatedKey = validateObjectKey(key, 'Object key', createError, false);

  if (
    validatedKey !== normalizedPrefix &&
    !validatedKey.startsWith(`${normalizedPrefix}/`)
  ) {
    throw createError(
      `Object key must stay within prefix ${normalizedPrefix}/`,
    );
  }

  return key;
}
