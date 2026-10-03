import { createHmac } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { GoldenContentKind } from './golden-set.types';

export function hmacHex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

export function deriveBrandFixtureId(
  key: string,
  organizationId: string,
  brandId: string,
): string {
  return `brand-${hmacHex(key, `brand:${organizationId}:${brandId}`).slice(0, 12)}`;
}

export function deriveRowId(
  key: string,
  organizationId: string,
  contentKind: GoldenContentKind,
  contentKey: string,
): string {
  return `gs1-${contentKind}-${hmacHex(key, `row:${organizationId}:${contentKey}`).slice(0, 16)}`;
}

export function readKeyFile(path: string, repoRoot: string): string {
  if (!isAbsolute(path)) {
    throw new Error('The key-file path must be absolute.');
  }

  const resolvedRoot = realpathSync(resolve(repoRoot));
  const resolvedPath = realpathSync(path);
  const relativePath = relative(resolvedRoot, resolvedPath);
  const isOutsideRepo =
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);
  if (!isOutsideRepo) {
    throw new Error('The key-file path must resolve outside the repository.');
  }

  const key = readFileSync(resolvedPath, 'utf8').trim();
  if (key.length < 32) {
    throw new Error('The anonymiser key must contain at least 32 characters.');
  }
  return key;
}
