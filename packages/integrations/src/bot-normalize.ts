import type { IntegrationPlatform } from '@genfeedai/enums';
import type { OrgIntegration } from './types';

/** Returns a valid Date parsed from value, or new Date() as a fallback. */
function parseDateOrNow(value: unknown): Date {
  if (value === undefined || value === null) {
    return new Date();
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Returns value only when it is a plain (non-null, non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize a raw API payload into an OrgIntegration.
 *
 * Handles both the MongoDB `_id` field (legacy open-source API) and the
 * Prisma `id` field (cloud API), as well as `orgId` vs `organization`.
 * Returns `null` when required fields are missing.
 *
 * Previously copy-pasted identically into all three bot managers.
 */
export function normalizeIntegration(
  payload: unknown,
  platform: `${IntegrationPlatform}`,
): OrgIntegration | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  const rawId = raw.id ?? raw._id;
  const rawOrgId = raw.orgId ?? raw.organization;
  const rawToken = raw.botToken;

  if (!rawId || !rawOrgId || !rawToken) {
    return null;
  }

  return {
    botToken: String(rawToken),
    config: isPlainObject(raw.config)
      ? (raw.config as OrgIntegration['config'])
      : {},
    createdAt: parseDateOrNow(raw.createdAt),
    id: String(rawId),
    orgId: String(rawOrgId),
    platform,
    status: (raw.status as OrgIntegration['status'] | undefined) || 'active',
    updatedAt: parseDateOrNow(raw.updatedAt),
  };
}

/**
 * Normalize an array of raw API payloads into OrgIntegration[].
 * Silently drops any entries that fail normalization.
 */
export function normalizeIntegrations(
  payload: unknown,
  platform: `${IntegrationPlatform}`,
): OrgIntegration[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => normalizeIntegration(item, platform))
    .filter((item): item is OrgIntegration => item !== null);
}
