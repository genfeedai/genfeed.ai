import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
} from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterPricingRows,
  findPendingVersion,
  seedArticles,
  seedWorkflows,
  syncProviderPrices,
} from '../../src/operations/admin';

const { adminPost } = vi.hoisted(() => ({ adminPost: vi.fn() }));

vi.mock('@/api/admin-client', () => ({
  adminGet: vi.fn(),
  adminPatch: vi.fn(),
  adminPost,
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
});
