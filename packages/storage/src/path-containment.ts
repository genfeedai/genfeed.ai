import type { Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
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
function assertConfiguredRoot(
  rootDir: unknown,
  createError: SecurityErrorFactory,
): asserts rootDir is string {
  if (!rootDir || typeof rootDir !== 'string') {
    throw createError('Containment root is not configured');
  }
}

function assertCandidatePath(
  candidatePath: unknown,
  createError: SecurityErrorFactory,
): asserts candidatePath is string {
  if (!candidatePath || typeof candidatePath !== 'string') {
    throw createError('File path is required and must be a string');
  }
}

function hasTraversalSegment(value: string): boolean {
  return value.split(/[\\/]/).some((segment) => segment === '..');
}

function assertUnambiguousPathSyntax(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
): void {
  if (
    value.includes('\0') ||
    (path.sep !== '\\' && value.includes('\\')) ||
    hasTraversalSegment(value) ||
    (path.sep !== '\\' && /^[A-Za-z]:\//.test(value))
  ) {
    throw createError(`${name} contains traversal or separator confusion`);
  }

  let decoded = value;
  for (;;) {
    if (/%(?:00|2f|5c)/i.test(decoded)) {
      throw createError(`${name} contains encoded path syntax`);
    }

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return;
    }

    if (next === decoded) {
      return;
    }

    if (
      next.includes('\0') ||
      (path.sep !== '\\' && next.includes('\\')) ||
      hasTraversalSegment(next) ||
      (!decoded.startsWith('/') && next.startsWith('/')) ||
      (path.sep !== '\\' &&
        !/^[A-Za-z]:\//.test(decoded) &&
        /^[A-Za-z]:\//.test(next))
    ) {
      throw createError(`${name} contains encoded path syntax`);
    }

    decoded = next;
  }
}

function isPathWithinRoot(resolvedRoot: string, resolved: string): boolean {
  return (
    resolved === resolvedRoot ||
    resolved.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

export function resolveContainedPath(
  rootDir: string,
  candidatePath: string,
  createError: SecurityErrorFactory,
): string {
  assertConfiguredRoot(rootDir, createError);
  assertCandidatePath(candidatePath, createError);
  assertUnambiguousPathSyntax(candidatePath, 'File path', createError);

  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, candidatePath);

  if (!isPathWithinRoot(resolvedRoot, resolved)) {
    throw createError(`File path must stay within ${resolvedRoot}`);
  }

  return resolved;
}

/** `null` for a path that does not exist, so the caller can stop walking. */
async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await lstat(target);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

/**
 * Resolve a candidate below a fixed root and reject it if any component
 * between the root and the target is a symbolic link.
 *
 * {@link resolveContainedPath} is purely lexical — `path.resolve` never touches
 * the filesystem — so a link planted under the root resolves to a
 * contained-looking path while pointing anywhere on disk. That matters most on
 * desktop, where the root is Electron's `userData` directory and the disk
 * behind it is the user's own.
 *
 * Every link below the root is rejected, not only the ones that escape. The
 * driver never creates links, so one existing is already anomalous, and the
 * blanket rule closes the dangling-link hole that a `realpath` check leaves
 * open: `realpath` reports `ENOENT` for a broken link, after which a write
 * would follow it and create the target outside the root.
 */
export async function resolveContainedPathWithoutSymlinks(
  rootDir: string,
  candidatePath: string,
  createError: SecurityErrorFactory,
): Promise<string> {
  const resolvedRoot = path.resolve(rootDir);
  const containedPath = resolveContainedPath(
    resolvedRoot,
    candidatePath,
    createError,
  );
  const relativePath = path.relative(resolvedRoot, containedPath);

  if (relativePath === '') {
    return containedPath;
  }

  let currentPath = resolvedRoot;

  for (const segment of relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, segment);

    const stats = await lstatOrNull(currentPath);

    // Nothing can exist below a missing entry, so the walk is complete.
    if (!stats) {
      break;
    }

    if (stats.isSymbolicLink()) {
      throw createError(
        `File path must stay within ${resolvedRoot} and must not traverse a symbolic link`,
      );
    }
  }

  return containedPath;
}

function assertNonEmptyString(
  value: unknown,
  name: string,
  createError: SecurityErrorFactory,
): asserts value is string {
  if (!value || typeof value !== 'string') {
    throw createError(`${name} is required and must be a string`);
  }
}

function assertRelativePosixKey(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
): void {
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw createError(`${name} must be a relative POSIX object key`);
  }
}

function hasInvalidObjectKeySegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..';
}

function normalizeObjectKey(
  value: string,
  isTrailingSlashAllowed: boolean,
): string {
  return isTrailingSlashAllowed && value.endsWith('/')
    ? value.slice(0, -1)
    : value;
}

function assertObjectKeySegments(
  value: string,
  normalized: string,
  name: string,
  isTrailingSlashAllowed: boolean,
  createError: SecurityErrorFactory,
): void {
  if (!normalized) {
    throw createError(`${name} contains an invalid path segment`);
  }

  if (!isTrailingSlashAllowed && value.endsWith('/')) {
    throw createError(`${name} contains an invalid path segment`);
  }

  if (normalized.split('/').some(hasInvalidObjectKeySegment)) {
    throw createError(`${name} contains an invalid path segment`);
  }
}

function validateObjectKey(
  value: string,
  name: string,
  createError: SecurityErrorFactory,
  isTrailingSlashAllowed: boolean,
): string {
  assertNonEmptyString(value, name, createError);
  assertUnambiguousPathSyntax(value, name, createError);
  assertRelativePosixKey(value, name, createError);
  const normalized = normalizeObjectKey(value, isTrailingSlashAllowed);
  assertObjectKeySegments(
    value,
    normalized,
    name,
    isTrailingSlashAllowed,
    createError,
  );
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
