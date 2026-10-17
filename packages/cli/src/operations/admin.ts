import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  ModelPricingAttentionLevel,
} from '@genfeedai/contracts/interfaces';
import { adminGet, adminPatch, adminPost } from '@/api/admin-client';
import { flattenSingle, type JsonApiDocument } from '@/api/json-api';

export interface SystemBrandRevision {
  content?: unknown;
  id: string;
  status?: string;
  updatedAt: string;
}

export interface PricingReportFilter {
  /** Keep only models that need an operator (red and orange). */
  isAttentionOnly?: boolean;
  level?: ModelPricingAttentionLevel;
  provider?: string;
}

export async function readPricingReport(): Promise<AdminModelPricingReport> {
  return flattenSingle<AdminModelPricingReport>(
    await adminGet<JsonApiDocument>('/admin/model-pricing')
  );
}

export function filterPricingRows(
  report: AdminModelPricingReport,
  filter: PricingReportFilter
): AdminModelPricingRow[] {
  return report.rows.filter((row) => {
    if (filter.provider && row.provider !== filter.provider) return false;
    if (filter.level) return row.attentionLevel === filter.level;
    if (filter.isAttentionOnly) return row.attentionLevel !== null;
    return true;
  });
}

/**
 * Promote a model's pending provider rates. `expectedPendingVersion` pins the
 * exact pending contract the operator reviewed; the API rejects a stale one.
 */
export async function approvePricingRates(
  modelId: string,
  expectedPendingVersion: string
): Promise<AdminModelPricingReport> {
  return flattenSingle<AdminModelPricingReport>(
    await adminPost<JsonApiDocument>(
      `/admin/model-pricing/${encodeURIComponent(modelId)}/approve-rates`,
      { expectedPendingVersion }
    )
  );
}

/** The pending version an approval must name, or undefined when there is none. */
export function findPendingVersion(
  report: AdminModelPricingReport,
  modelId: string
): string | undefined {
  const row = report.rows.find(
    (candidate) => candidate.id === modelId || candidate.key === modelId
  );
  return row?.isRateApprovalAvailable ? row.pending?.version : undefined;
}

export async function readSystemBrand(): Promise<SystemBrandRevision> {
  return flattenSingle<SystemBrandRevision>(await adminGet<JsonApiDocument>('/admin/system-brand'));
}

export async function updateSystemBrand(
  revisionId: string,
  content: unknown,
  updatedAt: string
): Promise<SystemBrandRevision> {
  return flattenSingle<SystemBrandRevision>(
    await adminPatch<JsonApiDocument>(
      `/admin/system-brand/revisions/${encodeURIComponent(revisionId)}`,
      { content, updatedAt }
    )
  );
}

export async function approveSystemBrand(
  revisionId: string,
  updatedAt: string
): Promise<SystemBrandRevision> {
  return flattenSingle<SystemBrandRevision>(
    await adminPost<JsonApiDocument>(
      `/admin/system-brand/revisions/${encodeURIComponent(revisionId)}/approve`,
      { updatedAt }
    )
  );
}
