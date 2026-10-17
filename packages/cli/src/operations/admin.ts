import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  IOrganizationAppsReport,
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

export type PriceSyncProvider = 'all' | 'fal' | 'replicate';

export interface QueuedPriceSync {
  jobId: string;
  provider: string;
}

export interface ArticlesSeedInput {
  brandId?: string;
  brandSlug?: string;
  dryRun: boolean;
  organizationId?: string;
  organizationLabel?: string;
  ownerEmail?: string;
}

export interface ArticlesSeedSummary {
  brandId: string;
  created: number;
  dryRun: boolean;
  organizationId: string;
  refreshed: number;
}

export interface WorkflowsSeedInput {
  allBrands?: boolean;
  brandId?: string;
  dryRun: boolean;
  organizationId?: string;
}

export interface WorkflowsSeedSummary {
  dryRun: boolean;
  skipped: number;
  unchanged: number;
  updated: number;
}

export interface PricingReportFilter {
  /** Keep only models that need an operator (red and orange). */
  isAttentionOnly?: boolean;
  level?: ModelPricingAttentionLevel;
  provider?: string;
}

export async function readOrganizationAppsReport(): Promise<IOrganizationAppsReport> {
  return flattenSingle<IOrganizationAppsReport>(
    await adminGet<JsonApiDocument>('/admin/organization-apps')
  );
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

/** Queue the provider price import now; the weekly schedule is not needed. */
export async function syncProviderPrices(provider: PriceSyncProvider): Promise<QueuedPriceSync[]> {
  const result = await adminPost<{ queued: QueuedPriceSync[] }>('/admin/model-pricing/sync', {
    provider,
  });
  return result.queued;
}

export function seedArticles(input: ArticlesSeedInput): Promise<ArticlesSeedSummary> {
  return adminPost<ArticlesSeedSummary>('/admin/seeds/articles', input);
}

export function seedWorkflows(input: WorkflowsSeedInput): Promise<WorkflowsSeedSummary> {
  return adminPost<WorkflowsSeedSummary>('/admin/seeds/workflows', input);
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
