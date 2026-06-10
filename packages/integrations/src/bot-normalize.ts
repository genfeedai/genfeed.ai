import type { IntegrationPlatform } from '@genfeedai/enums';
import type { OrgIntegration } from './types';

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
    config: (raw.config as OrgIntegration['config']) || {},
    createdAt: raw.createdAt ? new Date(raw.createdAt as string) : new Date(),
    id: String(rawId),
    orgId: String(rawOrgId),
    platform,
    status: (raw.status as OrgIntegration['status'] | undefined) || 'active',
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt as string) : new Date(),
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
