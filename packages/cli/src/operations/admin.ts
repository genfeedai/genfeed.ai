import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  IHarnessActivationReport,
  IOnboardingFunnelReport,
  IOrganizationAppsReport,
  IOrganizationsReport,
  ISystemNotificationOverview,
  ITraining,
  ModelPricingAttentionLevel,
  ModelPricingFixResult,
} from '@genfeedai/contracts/interfaces';
import { adminGet, adminPatch, adminPost } from '@/api/admin-client';
import {
  extractPagination,
  flattenCollection,
  flattenSingle,
  type JsonApiDocument,
} from '@/api/json-api';

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

export interface TemplatesSeedInput {
  dryRun: boolean;
}

export interface TemplatesSeedSummary {
  dryRun: boolean;
  keys: string[];
  unchanged: number;
  written: number;
}

export interface PricingReportFilter {
  /** Keep only models that need an operator (red and orange). */
  isAttentionOnly?: boolean;
  level?: ModelPricingAttentionLevel;
  provider?: string;
}

export interface OrganizationCreditGrantInput {
  amount: number;
  expiresInDays?: number;
  idempotencyKey?: string;
  reason: string;
}

export interface OrganizationCreditGrant {
  balance: number;
  creditsGranted: number;
  expiresAt: string | null;
  organizationId: string;
}

export interface OrganizationBrandInput {
  backgroundColor?: string;
  description?: string;
  fontFamily?: string;
  label: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface OrganizationBrandCreated {
  id: string;
  label: string;
  organizationId: string;
  slug: string;
}

export interface OrganizationBrandScan {
  brandId: string;
  organizationId: string;
  scrapeReason?: string;
  scrapeStatus: 'failed' | 'scraped';
  summary?: unknown;
}

export interface WarmupAccountInput {
  brandName: string;
  guidance?: string;
  leadEmail: string;
  leadFirstName?: string;
  leadLastName?: string;
  organizationName: string;
  websiteUrl?: string;
}

export interface WarmupPrepareInput {
  action: string;
  amount?: number;
  publicProfileUrl?: string;
  reason?: string;
  sourceUrl?: string;
}

export type WarmupAccountRecord = Record<string, unknown> & { id: string };

interface DataEnvelope<T> {
  data: T;
}

/** Grant credits to an organization the operator is not a member of. */
export async function grantOrganizationCredits(
  organizationId: string,
  input: OrganizationCreditGrantInput
): Promise<OrganizationCreditGrant> {
  const response = await adminPost<DataEnvelope<OrganizationCreditGrant>>(
    `/admin/organizations/${encodeURIComponent(organizationId)}/credits`,
    input
  );
  return response.data;
}

/** Create a brand inside any organization, independent of the operator's own orgs. */
export async function createOrganizationBrand(
  organizationId: string,
  input: OrganizationBrandInput
): Promise<OrganizationBrandCreated> {
  const response = await adminPost<DataEnvelope<OrganizationBrandCreated>>(
    `/admin/organizations/${encodeURIComponent(organizationId)}/brands`,
    input
  );
  return response.data;
}

/** Scan a website or social profile into the brand kit (logo, banner, colors, voice). */
export async function scanOrganizationBrand(
  organizationId: string,
  brandId: string,
  url: string
): Promise<OrganizationBrandScan> {
  const response = await adminPost<DataEnvelope<OrganizationBrandScan>>(
    `/admin/organizations/${encodeURIComponent(organizationId)}/brands/${encodeURIComponent(brandId)}/scan`,
    { url }
  );
  return response.data;
}

export async function createWarmupAccount(input: WarmupAccountInput): Promise<WarmupAccountRecord> {
  return flattenSingle<WarmupAccountRecord>(
    await adminPost<JsonApiDocument>('/admin/warmup-accounts', input)
  );
}

export async function prepareWarmupAccount(
  accountId: string,
  input: WarmupPrepareInput
): Promise<WarmupAccountRecord> {
  return flattenSingle<WarmupAccountRecord>(
    await adminPost<JsonApiDocument>(
      `/admin/warmup-accounts/${encodeURIComponent(accountId)}/prepare`,
      input
    )
  );
}

const ORGANIZATION_APPS_PAGE_SIZE = 100;

async function readOrganizationAppsPage(page: number): Promise<IOrganizationAppsReport> {
  return flattenSingle<IOrganizationAppsReport>(
    await adminGet<JsonApiDocument>(
      `/admin/organization-apps?page=${page}&limit=${ORGANIZATION_APPS_PAGE_SIZE}`
    )
  );
}

/** Every organization: the API pages the report, so walk the pages. */
export async function readOrganizationAppsReport(): Promise<IOrganizationAppsReport> {
  const first = await readOrganizationAppsPage(1);
  const organizations = [...first.organizations];

  for (let page = 2; page <= first.pagination.pages; page += 1) {
    organizations.push(...(await readOrganizationAppsPage(page)).organizations);
  }

  return { ...first, organizations };
}

export interface AdminTrainingRow {
  brandId: string | null;
  createdAt: string | null;
  id: string;
  isActive: boolean | null;
  label: string;
  model: string | null;
  organizationId: string | null;
  status: string | null;
  totalGeneratedImages: number | null;
  totalSources: number | null;
}

export interface AdminTrainingsReport {
  byStatus: Record<string, number>;
  total: number;
  trainings: AdminTrainingRow[];
}

const TRAININGS_PAGE_SIZE = 100;

function readRelationId(value: { id: string } | string | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function toTrainingRow(training: ITraining): AdminTrainingRow {
  return {
    brandId: readRelationId(training.brand),
    createdAt: training.createdAt ?? null,
    id: training.id,
    isActive: training.isActive ?? null,
    label: training.label,
    model: training.model ?? null,
    organizationId: readRelationId(training.organization),
    status: training.status ?? null,
    totalGeneratedImages: training.totalGeneratedImages ?? null,
    totalSources: training.totalSources ?? null,
  };
}

/** Every training across organizations, newest first: the API pages the list, so walk the pages. */
export async function readTrainingsReport(): Promise<AdminTrainingsReport> {
  const trainings: AdminTrainingRow[] = [];
  let pages = 1;

  for (let page = 1; page <= pages; page += 1) {
    const document = await adminGet<JsonApiDocument>(
      `/trainings?page=${page}&limit=${TRAININGS_PAGE_SIZE}`
    );
    pages = extractPagination(document)?.pages ?? 1;
    trainings.push(...flattenCollection<ITraining>(document).map(toTrainingRow));
  }

  const byStatus: Record<string, number> = {};
  for (const training of trainings) {
    const status = training.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { byStatus, total: trainings.length, trainings };
}

export async function readOnboardingFunnel(days: number): Promise<IOnboardingFunnelReport> {
  return flattenSingle<IOnboardingFunnelReport>(
    await adminGet<JsonApiDocument>(`/admin/onboarding-funnel?days=${days}`)
  );
}

const ORGANIZATIONS_PAGE_SIZE = 100;

async function readOrganizationsPage(
  page: number,
  isIncludingDeleted: boolean
): Promise<IOrganizationsReport> {
  const deleted = isIncludingDeleted ? '&includeDeleted=true' : '';
  return flattenSingle<IOrganizationsReport>(
    await adminGet<JsonApiDocument>(
      `/admin/organizations?page=${page}&limit=${ORGANIZATIONS_PAGE_SIZE}${deleted}`
    )
  );
}

/** Every organization: the API pages the list, so walk the pages. */
export async function readOrganizationsReport(
  isIncludingDeleted = false
): Promise<IOrganizationsReport> {
  const first = await readOrganizationsPage(1, isIncludingDeleted);
  const organizations = [...first.organizations];

  for (let page = 2; page <= first.pagination.pages; page += 1) {
    organizations.push(...(await readOrganizationsPage(page, isIncludingDeleted)).organizations);
  }

  return { ...first, organizations };
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

/**
 * "Fix pricing" from the admin app: re-apply the reviewed rate sheet to models
 * it prices, approve pending provider rates, and queue the import for models
 * with no rates. Every model that needs it when no ids are given.
 */
export function fixModelPricing(modelIds?: readonly string[]): Promise<ModelPricingFixResult> {
  return adminPost<ModelPricingFixResult>(
    '/admin/model-pricing/fix',
    modelIds?.length ? { modelIds } : {}
  );
}

/** Report rows `fix` acts on: anything red, or with an approvable pending rate. */
export function findPricingFixTargets(
  report: AdminModelPricingReport,
  models: readonly string[] = []
): AdminModelPricingRow[] {
  return report.rows.filter(
    (row) =>
      (row.isRateApprovalAvailable || row.attentionLevel !== null) &&
      (models.length === 0 || models.includes(row.id) || models.includes(row.key))
  );
}

export function seedArticles(input: ArticlesSeedInput): Promise<ArticlesSeedSummary> {
  return adminPost<ArticlesSeedSummary>('/admin/seeds/articles', input);
}

export function seedTemplates(input: TemplatesSeedInput): Promise<TemplatesSeedSummary> {
  return adminPost<TemplatesSeedSummary>('/admin/seeds/templates', input);
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

export async function readHarnessActivation(): Promise<IHarnessActivationReport> {
  return flattenSingle<IHarnessActivationReport>(
    await adminGet<JsonApiDocument>('/admin/harness/activation')
  );
}

export const DISCORD_CHANNELS = ['deployments', 'models', 'posts', 'studio', 'users'] as const;

export type DiscordChannel = (typeof DISCORD_CHANNELS)[number];

/** Read-only: the same overview the admin notifications settings page shows. */
export async function readNotificationStatus(): Promise<ISystemNotificationOverview> {
  return flattenSingle<ISystemNotificationOverview>(
    await adminGet<JsonApiDocument>('/admin/system-notifications')
  );
}

/**
 * Operator Discord channels the API reports with no channel ID. The overview
 * never carries the IDs themselves, so this says set or empty, nothing more.
 */
export function findMissingDiscordChannels(
  status: ISystemNotificationOverview,
  expectedChannels: readonly DiscordChannel[] = DISCORD_CHANNELS
): DiscordChannel[] {
  const missing = new Set(status.configuration.discord?.missingChannels ?? []);
  return expectedChannels.filter((channel) => missing.has(channel));
}

/**
 * The expected pack ids that are not loaded from a configured external pack.
 * A built-in pack with the same id does not count: fallback is not activation.
 */
export function findMissingExternalPacks(
  report: IHarnessActivationReport,
  expectedPackIds: readonly string[]
): string[] {
  const loaded = new Set(
    report.external
      .filter((activation) => activation.state === 'loaded' && activation.packId)
      .map((activation) => activation.packId)
  );
  return expectedPackIds.filter((packId) => !loaded.has(packId));
}
