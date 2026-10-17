import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrganizationAppsReport } from '../../src/api/admin';

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock('../../src/api/client', () => ({
  get: (path: string) => mockGet(path),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenSingle: <T>(response: { data: T }) => response.data,
}));

describe('api/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the organization apps report', async () => {
    const report = { generatedAt: '2026-10-17T00:00:00.000Z', organizations: [], releaseFlags: {} };
    mockGet.mockResolvedValue({ data: report });

    const result = await getOrganizationAppsReport();

    expect(mockGet).toHaveBeenCalledWith('/admin/organization-apps');
    expect(result).toEqual(report);
  });
});
