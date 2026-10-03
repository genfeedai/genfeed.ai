import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';

/**
 * Ownership model for elements (#6038): a row with no organization is a
 * platform default shared with every organization; a row with an organization
 * belongs to it. Mirrors the preset scope in `PresetFilterUtil`.
 */
export interface ScopedElement {
  createdAt?: Date | string | null;
  isActive?: boolean;
  key?: string | null;
  organizationId?: string | null;
  sortOrder?: number | null;
}

export function isPlatformDefaultElement(entity: ScopedElement): boolean {
  return !entity.organizationId;
}

/**
 * Prisma OR arms for reading elements as `organizationId`: the platform
 * defaults plus the organization's own rows. Members only see ACTIVE defaults;
 * superadmins also see deactivated ones so they can manage them.
 */
export function buildElementScopeConditions({
  isSuperAdmin = false,
  organizationId,
}: {
  isSuperAdmin?: boolean;
  organizationId?: string | null;
}): Record<string, unknown>[] {
  const defaults: Record<string, unknown> = { organizationId: null };

  if (!isSuperAdmin) {
    defaults.isActive = true;
  }

  return organizationId ? [defaults, { organizationId }] : [defaults];
}

export function canReadElement(
  user: AuthenticatedUser,
  entity: ScopedElement,
): boolean {
  if (isPlatformDefaultElement(entity)) {
    return entity.isActive !== false || getIsSuperAdmin(user);
  }

  return entity.organizationId === user.organizationId;
}

export function withPlatformDefaultFlag<T extends ScopedElement>(
  entity: T,
): T & { isPlatformDefault: boolean } {
  return { ...entity, isPlatformDefault: isPlatformDefaultElement(entity) };
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function toTimestamp(value: ScopedElement['createdAt']): number {
  return value ? new Date(value).getTime() : 0;
}

/**
 * Platform defaults first in curated order (`sortOrder`, then key), followed by
 * the organization's own elements newest first.
 */
export function orderElementsForOrganization<T extends ScopedElement>(
  docs: readonly T[],
): T[] {
  const defaults = docs
    .filter(isPlatformDefaultElement)
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        compareText(left.key ?? '', right.key ?? ''),
    );
  const owned = docs
    .filter((doc) => !isPlatformDefaultElement(doc))
    .sort(
      (left, right) =>
        toTimestamp(right.createdAt) - toTimestamp(left.createdAt) ||
        compareText(left.key ?? '', right.key ?? ''),
    );

  return [...defaults, ...owned];
}
