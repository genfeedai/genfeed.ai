import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  patch: (...args: unknown[]) => mockPatch(...args),
}));

describe('api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the current user organizations', async () => {
    const organizations = [{ id: 'org-1', label: 'Acme' }];
    mockGet.mockResolvedValue(organizations);

    const { listMyOrganizations } = await import('../../src/api/organizations');
    const result = await listMyOrganizations();

    expect(mockGet).toHaveBeenCalledWith('/organizations?mine=true');
    expect(result).toEqual(organizations);
  });

  it('switches the active organization', async () => {
    const response = {
      brand: { id: 'brand-1', label: 'Acme Brand' },
      organization: { id: 'org-2', label: 'Other Org' },
    };
    mockPatch.mockResolvedValue(response);

    const { switchOrganization } = await import('../../src/api/organizations');
    const result = await switchOrganization('org-2');

    expect(mockPatch).toHaveBeenCalledWith('/organizations/org-2/activate');
    expect(result.organization.id).toBe('org-2');
  });
});
