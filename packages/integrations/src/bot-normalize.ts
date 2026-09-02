import {
  type IntegrationPlatform,
  IntegrationStatus,
} from '@genfeedai/contracts';
import type { OrgIntegration } from './types';

const INTEGRATION_STATUS_VALUES = new Set<string>(
  Object.values(IntegrationStatus),
);

/**
 * `IntegrationStatus` is a Prisma-backed enum, so the wire format is
 * SCREAMING_SNAKE. Anything else on the payload is unknown, not a second
 * spelling to be coerced — it falls back to ACTIVE like a missing field does.
 */
function normalizeStatus(rawStatus: unknown): OrgIntegration['status'] {
  return typeof rawStatus === 'string' &&
    INTEGRATION_STATUS_VALUES.has(rawStatus)
    ? (rawStatus as OrgIntegration['status'])
    : IntegrationStatus.ACTIVE;
}

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
    status: normalizeStatus(raw.status),
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
