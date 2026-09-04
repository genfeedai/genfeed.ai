import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';

// ---------------------------------------------------------------------------
// Helper: defensively parse the `config` JSON column
// ---------------------------------------------------------------------------
export function parseConfig(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Helper: normalize a raw Prisma record → OutreachCampaignDocument
// The Prisma model owns all relation ids. Domain-only settings live in config.
// ---------------------------------------------------------------------------
export function normalizeDoc(
  row: Record<string, unknown>,
): OutreachCampaignDocument {
  const cfg = parseConfig(row.config);
  return {
    ...cfg,
    brandId: row.brandId,
    campaignType: row.campaignType,
    config: cfg,
    createdAt: row.createdAt,
    credentialId: row.credentialId,
    id: row.id as string,
    isActive: row.isActive,
    isDeleted: row.isDeleted,
    organizationId: row.organizationId,
    platform: row.platform,
    status: (row.status as string) ?? (cfg.status as string),
    updatedAt: row.updatedAt,
    userId: row.userId,
  } as OutreachCampaignDocument;
}

export function normalizeDocs(rows: unknown[]): OutreachCampaignDocument[] {
  return rows.map((r) => normalizeDoc(r as Record<string, unknown>));
}
