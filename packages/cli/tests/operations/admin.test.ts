import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
} from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterPricingRows,
  findPendingVersion,
  readOrganizationAppsReport,
} from '../../src/operations/admin';

const { mockAdminGet } = vi.hoisted(() => ({ mockAdminGet: vi.fn() }));

vi.mock('../../src/api/admin-client', () => ({
  adminGet: (path: string) => mockAdminGet(path),
  adminPatch: vi.fn(),
  adminPost: vi.fn(),
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
    const data = { generatedAt: '2026-10-17T00:00:00.000Z', organizations: [], releaseFlags: {} };
    mockAdminGet.mockResolvedValue({ data });

    await expect(readOrganizationAppsReport()).resolves.toEqual(data);
    expect(mockAdminGet).toHaveBeenCalledWith('/admin/organization-apps');
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
});
