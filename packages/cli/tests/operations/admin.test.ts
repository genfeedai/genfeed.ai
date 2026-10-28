import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  IHarnessActivationReport,
} from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationBrand,
  createWarmupAccount,
  filterPricingRows,
  findMissingExternalPacks,
  findPendingVersion,
  findPricingFixTargets,
  fixModelPricing,
  grantOrganizationCredits,
  prepareWarmupAccount,
  readHarnessActivation,
  readOrganizationAppsReport,
  readOrganizationsReport,
  scanOrganizationBrand,
  seedArticles,
  seedTemplates,
  seedWorkflows,
  syncProviderPrices,
} from '../../src/operations/admin';

const { adminPost, mockAdminGet } = vi.hoisted(() => ({
  adminPost: vi.fn(),
  mockAdminGet: vi.fn(),
}));

vi.mock('../../src/api/admin-client', () => ({
  adminGet: (path: string) => mockAdminGet(path),
  adminPatch: vi.fn(),
  adminPost,
}));

vi.mock('../../src/api/json-api', () => ({
  flattenSingle: <T>(response: { data: T }) => response.data,
}));

function row(overrides: Partial<AdminModelPricingRow>): AdminModelPricingRow {
  return {
    attentionLevel: null,
    id: 'model-1',
    isRateApprovalAvailable: false,
    key: 'owner/model',
    pending: null,
    provider: 'replicate',
    ...overrides,
  } as AdminModelPricingRow;
}

function report(rows: AdminModelPricingRow[]): AdminModelPricingReport {
  return { rows } as AdminModelPricingReport;
}

describe('operations/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the organization apps report through the admin session', async () => {
    const data = {
      generatedAt: '2026-10-17T00:00:00.000Z',
      organizations: [],
      pagination: { limit: 100, page: 1, pages: 1, total: 0 },
      releaseFlags: {},
    };
    mockAdminGet.mockResolvedValue({ data });

    await expect(readOrganizationAppsReport()).resolves.toEqual(data);
    expect(mockAdminGet).toHaveBeenCalledWith('/admin/organization-apps?page=1&limit=100');
  });

  it('walks every page of the organization apps report', async () => {
    const pageOf = (page: number, id: string) => ({
      data: {
        generatedAt: '2026-10-17T00:00:00.000Z',
        organizations: [{ id }],
        pagination: { limit: 100, page, pages: 2, total: 101 },
        releaseFlags: { release_clipper: true },
      },
    });
    mockAdminGet
      .mockResolvedValueOnce(pageOf(1, 'org_1'))
      .mockResolvedValueOnce(pageOf(2, 'org_2'));

    const result = await readOrganizationAppsReport();

    expect(result.organizations).toEqual([{ id: 'org_1' }, { id: 'org_2' }]);
    expect(result.releaseFlags).toEqual({ release_clipper: true });
    expect(mockAdminGet).toHaveBeenNthCalledWith(2, '/admin/organization-apps?page=2&limit=100');
  });

  it('walks every page of the organizations list and can include deleted ones', async () => {
    const pageOf = (page: number, id: string) => ({
      data: {
        generatedAt: '2026-10-26T00:00:00.000Z',
        organizations: [{ id }],
        pagination: { limit: 100, page, pages: 2, total: 101 },
      },
    });
    mockAdminGet
      .mockResolvedValueOnce(pageOf(1, 'org_1'))
      .mockResolvedValueOnce(pageOf(2, 'org_2'));

    const result = await readOrganizationsReport(true);

    expect(result.organizations).toEqual([{ id: 'org_1' }, { id: 'org_2' }]);
    expect(mockAdminGet).toHaveBeenNthCalledWith(
      1,
      '/admin/organizations?page=1&limit=100&includeDeleted=true'
    );
    expect(mockAdminGet).toHaveBeenNthCalledWith(
      2,
      '/admin/organizations?page=2&limit=100&includeDeleted=true'
    );
  });

  const rows = [
    row({ attentionLevel: 'red', id: 'a', key: 'a/red' }),
    row({ attentionLevel: 'orange', id: 'b', key: 'b/orange', provider: 'fal' }),
    row({ id: 'c', key: 'c/ok' }),
  ];

  it('keeps every row without a filter', () => {
    expect(filterPricingRows(report(rows), {})).toHaveLength(3);
  });

  it('keeps only rows that need an operator', () => {
    expect(
      filterPricingRows(report(rows), { isAttentionOnly: true }).map((candidate) => candidate.id)
    ).toEqual(['a', 'b']);
  });

  it('filters by attention level and provider', () => {
    expect(filterPricingRows(report(rows), { level: 'red' }).map((r) => r.id)).toEqual(['a']);
    expect(filterPricingRows(report(rows), { provider: 'fal' }).map((r) => r.id)).toEqual(['b']);
  });

  it('finds the pending version by id or key, only when approval is available', () => {
    const approvable = row({
      id: 'x',
      isRateApprovalAvailable: true,
      key: 'x/model',
      pending: { version: 'sha256:abc' } as AdminModelPricingRow['pending'],
    });
    const stale = row({
      id: 'y',
      isRateApprovalAvailable: false,
      pending: { version: 'sha256:def' } as AdminModelPricingRow['pending'],
    });
    const data = report([approvable, stale]);

    expect(findPendingVersion(data, 'x')).toBe('sha256:abc');
    expect(findPendingVersion(data, 'x/model')).toBe('sha256:abc');
    expect(findPendingVersion(data, 'y')).toBeUndefined();
    expect(findPendingVersion(data, 'missing')).toBeUndefined();
  });

  it('finds the rows a pricing fix acts on, by id or key', () => {
    const data = report([
      row({ attentionLevel: 'red', id: 'a', key: 'x/a' }),
      row({ attentionLevel: 'orange', id: 'b', key: 'x/b' }),
      row({ id: 'c', isRateApprovalAvailable: true, key: 'x/c' }),
      row({ id: 'd', key: 'x/d' }),
    ]);

    expect(findPricingFixTargets(data).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(findPricingFixTargets(data, ['x/c', 'a', 'd']).map((entry) => entry.id)).toEqual([
      'a',
      'c',
    ]);
  });

  describe('one-off triggers', () => {
    beforeEach(() => {
      adminPost.mockReset();
    });

    it('queues the provider price import and returns the queued jobs', async () => {
      adminPost.mockResolvedValue({ queued: [{ jobId: 'job-1', provider: 'fal' }] });

      await expect(syncProviderPrices('fal')).resolves.toEqual([
        { jobId: 'job-1', provider: 'fal' },
      ]);
      expect(adminPost).toHaveBeenCalledWith('/admin/model-pricing/sync', { provider: 'fal' });
    });

    it('posts the pricing fix for the given models, or for all when none', async () => {
      const result = { approved: [], changed: [], repaired: [], syncQueued: [], unresolved: [] };
      adminPost.mockResolvedValue(result);

      await expect(fixModelPricing(['m1'])).resolves.toBe(result);
      expect(adminPost).toHaveBeenCalledWith('/admin/model-pricing/fix', { modelIds: ['m1'] });
      await fixModelPricing();
      expect(adminPost).toHaveBeenLastCalledWith('/admin/model-pricing/fix', {});
    });

    it('posts the article seed input as given', async () => {
      const summary = { brandId: 'b', created: 3, dryRun: true, organizationId: 'o', refreshed: 0 };
      adminPost.mockResolvedValue(summary);

      await expect(seedArticles({ dryRun: true, ownerEmail: 'a@b.co' })).resolves.toBe(summary);
      expect(adminPost).toHaveBeenCalledWith('/admin/seeds/articles', {
        dryRun: true,
        ownerEmail: 'a@b.co',
      });
    });

    it('posts the workflow seed input as given', async () => {
      const summary = { dryRun: false, skipped: 0, unchanged: 4, updated: 2 };
      adminPost.mockResolvedValue(summary);

      await expect(seedWorkflows({ allBrands: true, dryRun: false })).resolves.toBe(summary);
      expect(adminPost).toHaveBeenCalledWith('/admin/seeds/workflows', {
        allBrands: true,
        dryRun: false,
      });
    });
  });

  describe('seedTemplates', () => {
    it('posts the dry-run flag to the templates seed', async () => {
      const summary = { dryRun: true, keys: ['content.video.default'], unchanged: 3, written: 1 };
      adminPost.mockResolvedValue(summary);

      await expect(seedTemplates({ dryRun: true })).resolves.toBe(summary);
      expect(adminPost).toHaveBeenCalledWith('/admin/seeds/templates', { dryRun: true });
    });
  });

  describe('harness activation', () => {
    const activation: IHarnessActivationReport = {
      builtInPackIds: ['core-baseline', 'platform-x'],
      external: [
        { packId: 'brand-pack', packVersion: '0.2.0', specifier: 'private-pack', state: 'loaded' },
      ],
      generatedAt: '2026-10-27T14:00:00.000Z',
      packs: [
        { id: 'core-baseline', version: '1.0.0' },
        { id: 'platform-x', version: '1.0.0' },
        { id: 'brand-pack', version: '0.2.0' },
      ],
    };

    it('reads the activation report from the admin route', async () => {
      mockAdminGet.mockResolvedValueOnce({ data: activation });
      await expect(readHarnessActivation()).resolves.toEqual(activation);
      expect(mockAdminGet).toHaveBeenCalledWith('/admin/harness/activation');
    });

    it('passes when every expected pack loaded from an external pack', () => {
      expect(findMissingExternalPacks(activation, ['brand-pack'])).toEqual([]);
    });

    it('does not count a built-in pack as an activated external pack', () => {
      expect(findMissingExternalPacks(activation, ['platform-x', 'other-pack'])).toEqual([
        'platform-x',
        'other-pack',
      ]);
    });

    it('does not count an external pack that failed to load', () => {
      const failed: IHarnessActivationReport = {
        ...activation,
        external: [{ specifier: 'private-pack', state: 'unresolvable' }],
      };
      expect(findMissingExternalPacks(failed, ['brand-pack'])).toEqual(['brand-pack']);
    });
  });

  describe('organization operator writes', () => {
    it('grants credits to an organization through the admin session', async () => {
      adminPost.mockResolvedValue({
        data: { balance: 500, creditsGranted: 500, expiresAt: null, organizationId: 'org/1' },
      });

      const grant = await grantOrganizationCredits('org/1', {
        amount: 500,
        reason: 'Customer setup',
      });

      expect(adminPost).toHaveBeenCalledWith('/admin/organizations/org%2F1/credits', {
        amount: 500,
        reason: 'Customer setup',
      });
      expect(grant.balance).toBe(500);
    });

    it('creates a brand inside the given organization', async () => {
      adminPost.mockResolvedValue({
        data: { id: 'brand-1', label: 'Gobl', organizationId: 'org-1', slug: 'gobl' },
      });

      const brand = await createOrganizationBrand('org-1', { label: 'Gobl' });

      expect(adminPost).toHaveBeenCalledWith('/admin/organizations/org-1/brands', {
        label: 'Gobl',
      });
      expect(brand.slug).toBe('gobl');
    });

    it('scans a url into the brand kit of the given brand', async () => {
      adminPost.mockResolvedValue({
        data: { brandId: 'brand-1', organizationId: 'org-1', scrapeStatus: 'scraped' },
      });

      const scan = await scanOrganizationBrand('org-1', 'brand-1', 'https://www.gobl.world/');

      expect(adminPost).toHaveBeenCalledWith('/admin/organizations/org-1/brands/brand-1/scan', {
        url: 'https://www.gobl.world/',
      });
      expect(scan.scrapeStatus).toBe('scraped');
    });

    it('creates and prepares warm-up accounts without any invitation route', async () => {
      adminPost.mockResolvedValue({ data: { id: 'warm-1' } });

      await createWarmupAccount({
        brandName: 'vitae.ai',
        leadEmail: 'poya@vitae.ai',
        organizationName: 'Gateway Ventures',
      });
      await prepareWarmupAccount('warm-1', { action: 'fund', amount: 500, reason: 'Setup' });

      expect(adminPost).toHaveBeenNthCalledWith(1, '/admin/warmup-accounts', {
        brandName: 'vitae.ai',
        leadEmail: 'poya@vitae.ai',
        organizationName: 'Gateway Ventures',
      });
      expect(adminPost).toHaveBeenNthCalledWith(2, '/admin/warmup-accounts/warm-1/prepare', {
        action: 'fund',
        amount: 500,
        reason: 'Setup',
      });
    });
  });
});
