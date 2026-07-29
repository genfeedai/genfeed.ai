/**
 * Shared helpers for global-unique slug allocation with race-safe retries.
 * Used by brand and organization provisioning paths (#2178).
 */

export const MAX_SLUG_ALLOCATION_ATTEMPTS = 16;

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: unknown }).code === 'P2002';
}

/**
 * True when the unique violation targets a slug column (or the target is
 * unknown — treat as slug race so we still retry rather than leak a 500).
 */
export function isSlugUniqueConstraintError(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) {
    return false;
  }
  const target = (error as { meta?: { target?: string[] | string } }).meta
    ?.target;
  if (!target) {
    return true;
  }
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((entry) => String(entry).toLowerCase().includes('slug'));
}

/**
 * Deterministic next candidate after a collision.
 * attempt 0 → base, 1 → base-2, 2 → base-3, …
 */
export function nextSlugCandidate(base: string, attempt: number): string {
  if (attempt <= 0) {
    return base;
  }
  return `${base}-${attempt + 1}`;
}

/**
 * Strip a trailing numeric suffix so retries share one base
 * (`acme-3` → `acme`, `acme` → `acme`).
 */
export function slugAllocationBase(slug: string): string {
  const trimmed = slug.trim();
  const match = trimmed.match(/^(.*?)-(\d+)$/);
  if (!match) {
    return trimmed;
  }
  const [, prefix, suffix] = match;
  // Only peel when the suffix looks like our allocator counter (2+).
  if (!prefix || Number(suffix) < 2) {
    return trimmed;
  }
  return prefix;
}
