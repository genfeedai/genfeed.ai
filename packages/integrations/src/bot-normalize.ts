import { type IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import type { OrgIntegration } from './types';

/**
 * Normalize a raw API payload into an OrgIntegration.
 *
 * Converts the canonical API `organizationId` field to the bot runtime's
 * intentionally shorter `orgId` field. Returns `null` when required fields
 * are missing.
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
  const rawId = raw.id;
  const rawOrgId = raw.organizationId;
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
    status:
      (raw.status as OrgIntegration['status'] | undefined) ||
      IntegrationStatus.ACTIVE,
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
